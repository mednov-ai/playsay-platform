package com.playsay.vocabulary.realtime

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeMode
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.TranslationState
import com.playsay.vocabulary.dto.VocabularyEntryResponse
import com.playsay.vocabulary.dto.VocabularyPracticeResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSessionSummaryResponse
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
import io.micrometer.core.instrument.simple.SimpleMeterRegistry

class VocabularyRealtimeHubTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()
    private val hub = VocabularyRealtimeHub(objectMapper, SimpleMeterRegistry())

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

    @Test
    fun `practice events expose only the learners own session`() {
        val practiceId = UUID.randomUUID()
        val lessonId = UUID.randomUUID()
        val student = session("practice-student")
        val teacher = session("practice-teacher")
        val partialTeacher = session("practice-partial-teacher")
        hub.register(student, "student-a")
        hub.register(teacher, "teacher-subject")
        hub.register(partialTeacher, "partial-teacher-subject")
        hub.subscribePractice(student, practiceId, lessonId)
        hub.subscribePractice(teacher, practiceId, lessonId)
        hub.subscribe(partialTeacher, "student-a", lessonId)
        val practice = practice(practiceId, lessonId)

        hub.publish(
            VocabularyPracticeChangedEvent(
                type = "vocabulary.session.updated",
                actorSubject = "student-a",
                practiceId = practiceId,
                lessonId = lessonId,
                ownerSubjects = setOf("student-a", "student-b"),
                sessionId = practice.sessions.first().id,
                practice = practice,
            ),
        )

        assertEquals(listOf("student-a"), practiceOwners(student))
        assertEquals(listOf("student-a", "student-b"), practiceOwners(teacher))
        assertEquals(false, sentTypes(partialTeacher).contains("vocabulary.session.updated"))
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

    private fun practiceOwners(session: WebSocketSession): List<String> {
        val captor = ArgumentCaptor.forClass(TextMessage::class.java)
        verify(session, atLeastOnce()).sendMessage(captor.capture())
        return captor.allValues
            .map { message -> objectMapper.readTree(message.payload) }
            .last { message -> message["type"].asText() == "vocabulary.session.updated" }
            .path("practice")
            .path("sessions")
            .map { item -> item["ownerSubject"].asText() }
    }

    private fun practice(practiceId: UUID, lessonId: UUID): VocabularyPracticeResponse {
        val now = Instant.parse("2026-07-28T09:00:00Z")
        return VocabularyPracticeResponse(
            id = practiceId,
            delivery = PracticeDelivery.LIVE,
            mode = PracticeMode.BALANCED,
            status = PracticeStatus.ACTIVE,
            lessonId = lessonId,
            assignmentId = null,
            sessions = listOf("student-a", "student-b").map { owner ->
                VocabularyPracticeSessionSummaryResponse(
                    id = UUID.randomUUID(),
                    ownerSubject = owner,
                    ownerName = owner,
                    status = SessionStatus.IN_PROGRESS,
                    revision = 1,
                    completedItems = 1,
                    totalItems = 3,
                    correctCount = 1,
                    attemptCount = 1,
                    accuracy = 1.0,
                    currentItem = null,
                    teacherHint = null,
                    helpRequested = false,
                    startedAt = now,
                    completedAt = null,
                    updatedAt = now,
                )
            },
            createdAt = now,
            updatedAt = now,
        )
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
