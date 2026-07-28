package com.playsay.vocabulary.realtime

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.TranslationState
import com.playsay.vocabulary.dto.VocabularyEntryResponse
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.atLeastOnce
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession

class VocabularyRealtimeHubTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()
    private val hub = VocabularyRealtimeHub(objectMapper)

    @Test
    fun `entry changes reach only sessions subscribed to the owner`() {
        val student = session("student-session")
        val teacher = session("teacher-session")
        val outsider = session("outsider-session")
        hub.register(student, "student-subject")
        hub.register(teacher, "teacher-subject")
        hub.register(outsider, "outsider-subject")
        hub.subscribe(student, "student-subject", null)
        hub.subscribe(teacher, "student-subject", UUID.randomUUID())
        hub.subscribe(outsider, "other-student", UUID.randomUUID())

        hub.publish(
            VocabularyEntryChangedEvent(
                type = "vocabulary.entry.created",
                ownerSubject = "student-subject",
                lessonId = UUID.randomUUID(),
                actorSubject = "teacher-subject",
                entry = entry(),
            ),
        )

        assertTrue(sentTypes(student).contains("vocabulary.entry.created"))
        assertTrue(sentTypes(teacher).contains("vocabulary.entry.created"))
        assertEquals(false, sentTypes(outsider).contains("vocabulary.entry.created"))
    }

    private fun session(id: String): WebSocketSession =
        mock(WebSocketSession::class.java).also { session ->
            `when`(session.id).thenReturn(id)
            `when`(session.isOpen).thenReturn(true)
        }

    private fun sentTypes(session: WebSocketSession): List<String> {
        val captor = ArgumentCaptor.forClass(TextMessage::class.java)
        verify(session, atLeastOnce()).sendMessage(captor.capture())
        return captor.allValues.map { message -> objectMapper.readTree(message.payload)["type"].asText() }
    }

    private fun entry() = VocabularyEntryResponse(
        id = UUID.randomUUID(),
        sourceText = "arrive",
        sourceLanguage = "en",
        targetLanguage = "ru",
        translation = "прибывать",
        partOfSpeech = null,
        example = null,
        exampleTranslation = null,
        translationState = TranslationState.CONFIRMED,
        status = EntryStatus.ACTIVE,
        occurrences = emptyList(),
        createdAt = Instant.parse("2026-07-28T09:00:00Z"),
        updatedAt = Instant.parse("2026-07-28T09:00:00Z"),
    )
}
