package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

private val vocabularyIntervalsDays = intArrayOf(1, 3, 7, 14, 30, 60)

internal fun applyPracticeRating(
    state: VocabularySkillStateEntity,
    rating: PracticeRating,
    now: Instant,
) {
    val hadSuccessfulPractice = state.successStreak > 0
    state.lastRating = rating
    state.lastPracticedAt = now
    when (rating) {
        PracticeRating.AGAIN -> {
            state.intervalIndex = 0
            state.successStreak = 0
            state.lapseCount += 1
            state.stage = LearningStage.LEARNING
            state.dueAt = now.plus(1, ChronoUnit.DAYS)
        }
        PracticeRating.HARD -> {
            val currentDays = vocabularyIntervalsDays[state.intervalIndex.coerceIn(vocabularyIntervalsDays.indices)]
            state.stage = stageForInterval(state.intervalIndex)
            state.dueAt = now.plus((currentDays / 2).coerceAtLeast(1).toLong(), ChronoUnit.DAYS)
        }
        PracticeRating.GOOD -> {
            // A freshly created state starts at index 0 but has not earned the one-day
            // interval yet. Only subsequent sessions advance to 3, 7, 14, 30 and 60.
            if (hadSuccessfulPractice) {
                state.intervalIndex = (state.intervalIndex + 1).coerceAtMost(vocabularyIntervalsDays.lastIndex)
            }
            state.successStreak += 1
            state.stage = stageForInterval(state.intervalIndex)
            state.dueAt = now.plus(vocabularyIntervalsDays[state.intervalIndex].toLong(), ChronoUnit.DAYS)
        }
    }
    state.updatedAt = now
}

internal fun stageForInterval(intervalIndex: Int): LearningStage = when {
    intervalIndex <= 0 -> LearningStage.LEARNING
    intervalIndex < 2 -> LearningStage.LEARNING
    intervalIndex < 4 -> LearningStage.REVIEW
    else -> LearningStage.MASTERED
}

internal fun aggregateVocabularyStage(states: List<VocabularySkillStateEntity>): LearningStage {
    val available = states.filter(VocabularySkillStateEntity::skillAvailable)
    if (available.isEmpty() || available.all { it.lastPracticedAt == null }) return LearningStage.NEW
    val meaningInterval = available.firstOrNull { it.skill == VocabularySkill.MEANING }?.intervalIndex ?: 0
    val formInterval = available.firstOrNull { it.skill == VocabularySkill.FORM }?.intervalIndex ?: 0
    val contextState = available.firstOrNull { it.skill == VocabularySkill.CONTEXT }
    return when {
        meaningInterval >= 2 && formInterval >= 4 && (contextState == null || contextState.intervalIndex >= 4) -> LearningStage.MASTERED
        meaningInterval >= 2 && formInterval >= 2 -> LearningStage.REVIEW
        else -> LearningStage.LEARNING
    }
}

internal data class VocabularySelectionCandidate(
    val id: UUID,
    val dueAt: Instant,
    val stage: LearningStage,
    val updatedAt: Instant,
    val priority: Int = 0,
)

internal fun selectPracticeEntryIds(
    candidates: List<VocabularySelectionCandidate>,
    wordLimit: Int,
    pinnedEntryIds: List<UUID>,
    excludedEntryIds: List<UUID>,
    now: Instant,
    maxNewItems: Int = 3,
): List<UUID> {
    val limit = wordLimit.coerceIn(1, 30)
    val excluded = excludedEntryIds.toSet()
    val pinnedOrder = pinnedEntryIds.withIndex().associate { it.value to it.index }
    val eligible = candidates.filterNot { it.id in excluded }
    val pinned = eligible.filter { it.id in pinnedOrder }.sortedBy { pinnedOrder[it.id] }
    var newCount = pinned.count { it.stage == LearningStage.NEW }
    val selected = pinned.toMutableList()
    val selectedIds = selected.mapTo(mutableSetOf()) { it.id }
    eligible
        .asSequence()
        .filterNot { it.id in selectedIds }
        .sortedWith(
            compareBy<VocabularySelectionCandidate>(
                { it.priority },
                { it.dueAt.isAfter(now) },
                { it.dueAt },
            ).thenByDescending { it.updatedAt }.thenBy { it.id },
        )
        .forEach { candidate ->
            if (selected.size >= limit) return@forEach
            val isNew = candidate.stage == LearningStage.NEW
            if (isNew && newCount >= maxNewItems.coerceIn(0, limit)) return@forEach
            selected += candidate
            selectedIds += candidate.id
            if (isNew) newCount += 1
        }
    return selected.take(limit).map { it.id }
}
