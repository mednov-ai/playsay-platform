package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class VocabularySchedulerTest {
    private val now = Instant.parse("2026-07-28T09:00:00Z")

    @Test
    fun `good advances through transparent intervals and stages`() {
        val state = state()

        val expected = listOf(
            Triple(0, LearningStage.LEARNING, 1L),
            Triple(1, LearningStage.LEARNING, 3L),
            Triple(2, LearningStage.REVIEW, 7L),
            Triple(3, LearningStage.REVIEW, 14L),
            Triple(4, LearningStage.MASTERED, 30L),
            Triple(5, LearningStage.MASTERED, 60L),
        )

        expected.forEach { (intervalIndex, stage, days) ->
            applyPracticeRating(state, PracticeRating.GOOD, now)
            assertEquals(intervalIndex, state.intervalIndex)
            assertEquals(stage, state.stage)
            assertEquals(now.plus(days, ChronoUnit.DAYS), state.dueAt)
        }
    }

    @Test
    fun `again resets interval schedules tomorrow and records lapse`() {
        val state = state().apply {
            intervalIndex = 4
            stage = LearningStage.MASTERED
            successStreak = 5
        }

        applyPracticeRating(state, PracticeRating.AGAIN, now)

        assertEquals(0, state.intervalIndex)
        assertEquals(0, state.successStreak)
        assertEquals(1, state.lapseCount)
        assertEquals(LearningStage.LEARNING, state.stage)
        assertEquals(now.plus(1, ChronoUnit.DAYS), state.dueAt)
    }

    @Test
    fun `hard keeps interval and never promotes stage`() {
        val state = state().apply {
            intervalIndex = 2
            stage = LearningStage.REVIEW
            successStreak = 2
        }

        applyPracticeRating(state, PracticeRating.HARD, now)

        assertEquals(2, state.intervalIndex)
        assertEquals(2, state.successStreak)
        assertEquals(LearningStage.REVIEW, state.stage)
        assertEquals(now.plus(3, ChronoUnit.DAYS), state.dueAt)
    }

    @Test
    fun `hard before first good does not skip the one day interval`() {
        val state = state()

        applyPracticeRating(state, PracticeRating.HARD, now)
        applyPracticeRating(state, PracticeRating.GOOD, now.plus(1, ChronoUnit.DAYS))

        assertEquals(0, state.intervalIndex)
        assertEquals(1, state.successStreak)
        assertEquals(now.plus(2, ChronoUnit.DAYS), state.dueAt)
    }

    @Test
    fun `selection prioritizes pins then overdue and excludes explicit entries`() {
        val pinned = id("pinned")
        val overdue = id("overdue")
        val excluded = id("excluded")
        val today = id("today")
        val selected = selectPracticeEntryIds(
            candidates = listOf(
                candidate(pinned, now.plus(30, ChronoUnit.DAYS), LearningStage.REVIEW),
                candidate(today, now, LearningStage.REVIEW),
                candidate(overdue, now.minus(3, ChronoUnit.DAYS), LearningStage.REVIEW),
                candidate(excluded, now.minus(10, ChronoUnit.DAYS), LearningStage.REVIEW),
            ),
            wordLimit = 3,
            pinnedEntryIds = listOf(pinned),
            excludedEntryIds = listOf(excluded),
            now = now,
        )

        assertEquals(listOf(pinned, overdue, today), selected)
        assertFalse(excluded in selected)
    }

    @Test
    fun `default selection admits at most three new words`() {
        val candidates = buildList {
            repeat(5) { index ->
                add(candidate(id("new-$index"), now.minus(2L + index, ChronoUnit.DAYS), LearningStage.NEW))
            }
            repeat(3) { index ->
                add(candidate(id("review-$index"), now.minus(1, ChronoUnit.DAYS), LearningStage.REVIEW))
            }
        }
        val selected = selectPracticeEntryIds(candidates, 6, emptyList(), emptyList(), now)
        val stages = candidates.associate { it.id to it.stage }

        assertEquals(6, selected.size)
        assertTrue(selected.count { stages[it] == LearningStage.NEW } <= 3)
        assertEquals(3, selected.count { stages[it] == LearningStage.REVIEW })
    }

    @Test
    fun `meaning-only receptive progress cannot master a word`() {
        val states = listOf(
            practicedState(VocabularySkill.MEANING, 5),
            practicedState(VocabularySkill.FORM, 0),
            practicedState(VocabularySkill.CONTEXT, 0),
        )

        assertEquals(LearningStage.LEARNING, aggregateVocabularyStage(states))
    }

    @Test
    fun `mastery requires productive form and context progress`() {
        val withoutContext = listOf(
            practicedState(VocabularySkill.MEANING, 2),
            practicedState(VocabularySkill.FORM, 4),
            practicedState(VocabularySkill.CONTEXT, 0),
        )
        assertEquals(LearningStage.REVIEW, aggregateVocabularyStage(withoutContext))
        val withContext = listOf(
            practicedState(VocabularySkill.MEANING, 2),
            practicedState(VocabularySkill.FORM, 4),
            practicedState(VocabularySkill.CONTEXT, 4),
        )
        assertEquals(LearningStage.MASTERED, aggregateVocabularyStage(withContext))
    }

    @Test
    fun `unavailable context does not block mastery`() {
        val states = listOf(
            practicedState(VocabularySkill.MEANING, 2),
            practicedState(VocabularySkill.FORM, 4),
            practicedState(VocabularySkill.CONTEXT, 0).apply { skillAvailable = false },
        )

        assertEquals(LearningStage.MASTERED, aggregateVocabularyStage(states))
    }

    @Test
    fun `adaptive success schedules later than failure and records versions and reasons`() {
        val success = state()
        val failure = state()
        val policy = AdaptiveVocabularySchedulingPolicy()

        policy.apply(success, VocabularySchedulingInput(PracticeRating.GOOD), now)
        policy.apply(failure, VocabularySchedulingInput(PracticeRating.AGAIN), now)

        assertTrue(success.dueAt.isAfter(failure.dueAt))
        assertEquals("adaptive-v1", success.policyVersion)
        assertEquals("STABLE", success.reviewReason)
        assertEquals("LAPSED", failure.reviewReason)
    }

    @Test
    fun `adaptive difficulty recovers after successful unassisted evidence`() {
        val state = state().apply { difficultyScore = BigDecimal("0.9000") }
        val policy = AdaptiveVocabularySchedulingPolicy()

        repeat(4) { policy.apply(state, VocabularySchedulingInput(PracticeRating.GOOD), now.plus(it.toLong(), ChronoUnit.DAYS)) }

        assertTrue(state.difficultyScore < BigDecimal("0.5000"))
        assertEquals("STABLE", state.reviewReason)
    }

    private fun state() = VocabularySkillStateEntity(
        skill = VocabularySkill.MEANING,
        stage = LearningStage.NEW,
        intervalIndex = 0,
        dueAt = now,
        createdAt = now,
        updatedAt = now,
    )

    private fun candidate(id: UUID, dueAt: Instant, stage: LearningStage) =
        VocabularySelectionCandidate(id, dueAt, stage, now)

    private fun practicedState(skill: VocabularySkill, intervalIndex: Int) = state().apply {
        this.skill = skill
        this.intervalIndex = intervalIndex
        lastPracticedAt = now
    }

    private fun id(value: String): UUID = UUID.nameUUIDFromBytes(value.toByteArray())
}
