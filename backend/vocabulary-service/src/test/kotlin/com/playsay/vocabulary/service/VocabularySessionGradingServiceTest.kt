package com.playsay.vocabulary.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularyAttemptRequest
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class VocabularySessionGradingServiceTest {
    private val grading = VocabularySessionGradingService(jacksonObjectMapper())

    @Test
    fun `schema v2 accepts reviewed meaning alternatives without exposing them in item response`() {
        val item = VocabularyPracticeItemEntity(
            exerciseType = PracticeExerciseType.MEANING_CHOICE,
            skill = VocabularySkill.MEANING,
            answer = "take care",
            schemaVersion = 2,
            acceptedAnswersJson = """["take care","take-care"]""",
        )
        val decision = grading.grade(item, request("  Take—care "))

        assertTrue(decision.correct)
        assertEquals(PracticeRating.GOOD, decision.rating)
    }

    @Test
    fun `form evidence keeps meaningful punctuation strict`() {
        val item = VocabularyPracticeItemEntity(
            exerciseType = PracticeExerciseType.FORM_INPUT,
            skill = VocabularySkill.FORM,
            answer = "take-care",
            schemaVersion = 2,
            acceptedAnswersJson = """["take-care"]""",
        )

        assertFalse(grading.grade(item, request("take care")).correct)
        assertTrue(grading.grade(item, request("TAKE-CARE")).correct)
    }

    @Test
    fun `hint deterministically lowers a correct answer to hard without AI`() {
        val item = VocabularyPracticeItemEntity(
            exerciseType = PracticeExerciseType.FORM_INPUT,
            skill = VocabularySkill.FORM,
            answer = "steady",
            schemaVersion = 2,
            acceptedAnswersJson = """["steady"]""",
        )
        val hinted = request("steady").copy(hintsUsed = 1)

        val decision = grading.grade(item, hinted)

        assertTrue(decision.correct)
        assertEquals(PracticeRating.HARD, decision.rating)
    }

    @Test
    fun `objective error is again even when client claims good`() {
        val item = VocabularyPracticeItemEntity(
            exerciseType = PracticeExerciseType.CONTEXT_GAP,
            answer = "went",
        )
        val decision = grading.grade(item, request("go", PracticeRating.GOOD))

        assertFalse(decision.correct)
        assertEquals(PracticeRating.AGAIN, decision.rating)
    }

    private fun request(answer: String, rating: PracticeRating? = null) = VocabularyAttemptRequest(
        clientAttemptId = UUID.randomUUID().toString(),
        itemId = UUID.randomUUID(),
        sessionRevision = 0,
        answer = answer,
        rating = rating,
    )
}
