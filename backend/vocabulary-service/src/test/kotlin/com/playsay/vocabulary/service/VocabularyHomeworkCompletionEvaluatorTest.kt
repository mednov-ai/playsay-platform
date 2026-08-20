package com.playsay.vocabulary.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyHomeworkCompletionPolicy
import com.playsay.vocabulary.entity.VocabularyPracticeAttemptEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class VocabularyHomeworkCompletionEvaluatorTest {
    private val evaluator = VocabularyHomeworkCompletionEvaluator(jacksonObjectMapper())

    @Test
    fun `meaningful activity ignores accuracy and requires eight distinct prompts across four entries`() {
        val entryIds = List(4) { UUID.randomUUID() }
        val items = List(10) { index -> item(index, entryIds[index % entryIds.size], completed = index < 8) }
        val attempts = items.take(8).mapIndexed { index, item -> attempt(item, correct = index == 0) }

        val result = evaluator.evaluate(practice(VocabularyHomeworkCompletionPolicy.MEANINGFUL_ACTIVITY), session(), items, attempts, emptyList())

        assertEquals("COMPLETED", result.state)
        assertEquals(8, result.distinctGradedPrompts)
        assertEquals(4, result.distinctEntries)
        assertEquals(0.125, result.accuracy)
    }

    @Test
    fun `short snapshots require every graded prompt`() {
        val items = List(3) { index -> item(index, UUID.randomUUID(), completed = index < 2) }
        val practice = practice(VocabularyHomeworkCompletionPolicy.MEANINGFUL_ACTIVITY)

        assertEquals("IN_PROGRESS", evaluator.evaluate(practice, session(), items, items.take(2).map { attempt(it, true) }, emptyList()).state)
        items.last().completedAt = Instant.now()
        assertEquals("COMPLETED", evaluator.evaluate(practice, session(), items, items.map { attempt(it, true) }, emptyList()).state)
    }

    @Test
    fun `session mastery and review policies use their own frozen completion signals`() {
        val entryId = UUID.randomUUID()
        val items = listOf(item(0, entryId, completed = true))
        val completed = session(SessionStatus.COMPLETED)
        val mastered = listOf(VocabularySkillStateEntity(entryId = entryId, stage = LearningStage.MASTERED, skillAvailable = true))

        assertEquals("COMPLETED", evaluator.evaluate(practice(VocabularyHomeworkCompletionPolicy.COMPLETE_SESSION), completed, items, emptyList(), emptyList()).state)
        assertEquals("COMPLETED", evaluator.evaluate(practice(VocabularyHomeworkCompletionPolicy.MASTERY_TARGET), session(), items, emptyList(), mastered).state)
        assertEquals("AWAITING_REVIEW", evaluator.evaluate(practice(VocabularyHomeworkCompletionPolicy.TEACHER_REVIEW), completed, items, emptyList(), emptyList()).state)
    }

    private fun practice(policy: VocabularyHomeworkCompletionPolicy) = VocabularyPracticeEntity(
        completionPolicy = policy,
        completionPolicyVersion = "vocabulary-homework-v1",
        completionThresholdsJson = """{"distinctGradedPrompts":8,"distinctEntries":4,"masteryPercent":80,"policyVersion":"vocabulary-homework-v1"}""",
    )

    private fun session(status: SessionStatus = SessionStatus.IN_PROGRESS) = VocabularyPracticeSessionEntity(status = status)

    private fun item(position: Int, entryId: UUID, completed: Boolean) = VocabularyPracticeItemEntity(
        id = UUID.randomUUID(),
        position = position,
        entryId = entryId,
        exerciseType = PracticeExerciseType.FORM_INPUT,
        completedAt = Instant.now().takeIf { completed },
    )

    private fun attempt(item: VocabularyPracticeItemEntity, correct: Boolean) = VocabularyPracticeAttemptEntity(
        itemId = item.id,
        correct = correct,
        hintsUsed = if (correct) 0 else 1,
        durationMs = 1_000,
    )
}
