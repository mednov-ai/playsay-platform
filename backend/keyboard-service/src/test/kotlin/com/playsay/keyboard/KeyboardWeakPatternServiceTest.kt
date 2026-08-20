package com.playsay.keyboard

import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.repo.TrainingResultRepo
import com.playsay.keyboard.service.KeyboardWeakPatternService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.web.server.ResponseStatusException

class KeyboardWeakPatternServiceTest {
    private val results = mock(TrainingResultRepo::class.java)
    private val service = KeyboardWeakPatternService(results, "service-token")

    @Test
    fun `aggregates only valid weak ngrams for the authorized subject`() {
        `when`(results.findByKeycloakSubjectOrderByCreatedAtDesc("learner")).thenReturn(
            listOf(
                result(perChord = mapOf("act" to 3, "x" to 9, "bad pattern" to 4)),
                result(perChord = mapOf("act" to 2, "eady" to 1)),
            ),
        )

        val response = service.forSubject("learner", "service-token")

        assertEquals(mapOf("act" to 5, "eady" to 1), response.patterns)
        assertEquals(2, response.evidenceSessions)
    }

    @Test
    fun `rejects a caller without the service token`() {
        assertThrows(ResponseStatusException::class.java) { service.forSubject("learner", "wrong") }
    }

    private fun result(perChord: Map<String, Int>) = TrainingResultEntity(
        chordSetId = 1,
        speedCpm = 100.0,
        accuracy = 0.9,
        errors = perChord.values.sum(),
        durationMs = 1_000,
        perChord = perChord,
    )
}
