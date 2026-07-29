package com.playsay.vocabulary.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularyAttemptRequest
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class VocabularySessionGradingServiceTest {
    private val grading = VocabularySessionGradingService(jacksonObjectMapper())

    @Test
    fun `schema v2 accepts normalized alternatives without exposing them in item response`() {
        val item = VocabularyPracticeItemEntity(
            exerciseType = PracticeExerciseType.FORM_INPUT,
            answer = "take care",
            schemaVersion = 2,
            acceptedAnswersJson = """["take care","take-care"]""",
        )
        val decision = grading.grade(item, request("  Take—care "))

        assertTrue(decision.correct)
        assertEquals(PracticeRating.GOOD, decision.rating)
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
