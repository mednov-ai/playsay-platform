package com.playsay.vocabulary.service

import com.playsay.vocabulary.config.VocabularyFeatureProperties
import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.MemoryReviewReason
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.temporal.ChronoUnit
import org.springframework.stereotype.Component

data class VocabularySchedulingInput(
    val rating: PracticeRating,
    val hintsUsed: Int = 0,
    val durationMs: Long = 0,
)

interface VocabularySchedulingPolicy {
    val version: String
    fun apply(state: VocabularySkillStateEntity, input: VocabularySchedulingInput, now: Instant)
}

@Component
class LegacyVocabularySchedulingPolicy : VocabularySchedulingPolicy {
    override val version = "legacy-v1"

    override fun apply(state: VocabularySkillStateEntity, input: VocabularySchedulingInput, now: Instant) {
        applyPracticeRating(state, input.rating, now)
        state.policyVersion = version
        state.reviewReason = when (input.rating) {
            PracticeRating.AGAIN -> MemoryReviewReason.LAPSED
            PracticeRating.HARD -> MemoryReviewReason.DIFFICULT
            PracticeRating.GOOD -> MemoryReviewReason.STABLE
        }.name
    }
}

@Component
class AdaptiveVocabularySchedulingPolicy(
    private val difficultyPolicy: VocabularyDifficultyPolicy = RecoverableVocabularyDifficultyPolicy(),
) : VocabularySchedulingPolicy {
    override val version = "adaptive-v1"

    override fun apply(state: VocabularySkillStateEntity, input: VocabularySchedulingInput, now: Instant) {
        val difficulty = difficultyPolicy.next(state.difficultyScore.toDouble(), input)
        state.difficultyScore = BigDecimal.valueOf(difficulty).setScale(4, RoundingMode.HALF_UP)
        state.lastRating = input.rating
        state.lastPracticedAt = now
        state.policyVersion = version

        when (input.rating) {
            PracticeRating.AGAIN -> {
                state.intervalIndex = 0
                state.successStreak = 0
                state.lapseCount += 1
                state.stage = LearningStage.LEARNING
                state.dueAt = now.plus(12, ChronoUnit.HOURS)
                state.reviewReason = MemoryReviewReason.LAPSED.name
            }
            PracticeRating.HARD -> {
                state.successStreak = (state.successStreak + 1).coerceAtMost(2)
                state.stage = stageForInterval(state.intervalIndex)
                state.dueAt = now.plus(if (difficulty >= 0.65) 18 else 36, ChronoUnit.HOURS)
                state.reviewReason = MemoryReviewReason.DIFFICULT.name
            }
            PracticeRating.GOOD -> {
                state.successStreak += 1
                state.intervalIndex = (state.intervalIndex + 1).coerceAtMost(5)
                state.stage = stageForInterval(state.intervalIndex)
                val baseDays = intArrayOf(1, 3, 7, 14, 30, 60)[state.intervalIndex]
                val adjustedDays = (baseDays * (1.0 - difficulty * 0.55)).toLong().coerceAtLeast(1)
                state.dueAt = now.plus(adjustedDays, ChronoUnit.DAYS)
                state.reviewReason = if (difficulty >= 0.55) {
                    MemoryReviewReason.DIFFICULT.name
                } else {
                    MemoryReviewReason.STABLE.name
                }
            }
        }
        state.updatedAt = now
    }
}

interface VocabularyDifficultyPolicy {
    val version: String
    fun next(previous: Double, input: VocabularySchedulingInput): Double
}

@Component
class RecoverableVocabularyDifficultyPolicy : VocabularyDifficultyPolicy {
    override val version = "decaying-difficulty-v1"

    override fun next(previous: Double, input: VocabularySchedulingInput): Double {
        val resultSignal = when (input.rating) {
            PracticeRating.AGAIN -> 0.42
            PracticeRating.HARD -> 0.16
            PracticeRating.GOOD -> -0.18
        }
        val helpSignal = input.hintsUsed.coerceAtMost(4) * 0.04
        val latencySignal = when {
            input.durationMs >= 45_000 -> 0.08
            input.durationMs >= 20_000 -> 0.04
            else -> 0.0
        }
        return (previous.coerceIn(0.0, 1.0) * 0.82 + resultSignal + helpSignal + latencySignal)
            .coerceIn(0.0, 1.0)
    }
}

@Component
class VocabularySchedulingPolicyRegistry(
    policies: List<VocabularySchedulingPolicy>,
    private val features: VocabularyFeatureProperties,
) {
    private val byVersion = policies.associateBy(VocabularySchedulingPolicy::version)

    fun versionForNewEvidence(): String = if (features.adaptivePolicyEnabled) "adaptive-v1" else "legacy-v1"

    fun require(version: String): VocabularySchedulingPolicy = byVersion[version]
        ?: error("Unsupported vocabulary scheduling policy: $version")
}

interface VocabularyMasteryPolicy {
    val version: String
    fun aggregate(states: List<VocabularySkillStateEntity>): LearningStage
}

@Component
class AvailableSkillsMasteryPolicy : VocabularyMasteryPolicy {
    override val version = "available-skills-v1"

    override fun aggregate(states: List<VocabularySkillStateEntity>): LearningStage {
        val available = states.filter(VocabularySkillStateEntity::skillAvailable)
        if (available.isEmpty() || available.all { it.lastPracticedAt == null }) return LearningStage.NEW
        val intervals = available.associate { it.skill to it.intervalIndex }
        val meaning = intervals[VocabularySkill.MEANING] ?: 0
        val form = intervals[VocabularySkill.FORM] ?: 0
        val contextReady = VocabularySkill.CONTEXT !in intervals || intervals.getValue(VocabularySkill.CONTEXT) >= 4
        return when {
            meaning >= 2 && form >= 4 && contextReady -> LearningStage.MASTERED
            meaning >= 2 && form >= 2 -> LearningStage.REVIEW
            else -> LearningStage.LEARNING
        }
    }
}

interface VocabularyExercisePlanningPolicy {
    val version: String
    fun isSkillAvailable(entry: VocabularyEntryEntity, skill: VocabularySkill): Boolean
}

@Component
class ContentAwareExercisePlanningPolicy : VocabularyExercisePlanningPolicy {
    override val version = "content-aware-v1"

    override fun isSkillAvailable(entry: VocabularyEntryEntity, skill: VocabularySkill): Boolean = when (skill) {
        VocabularySkill.CONTEXT -> com.playsay.vocabulary.util.hasExactVocabularyContext(entry)
        VocabularySkill.MEANING -> !entry.translation.isNullOrBlank()
        VocabularySkill.FORM, VocabularySkill.SPELLING -> entry.sourceText.isNotBlank()
    }
}
