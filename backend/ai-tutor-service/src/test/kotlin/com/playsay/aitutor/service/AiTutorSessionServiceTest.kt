package com.playsay.aitutor.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.aitutor.dto.*
import com.playsay.aitutor.entity.ConversationSessionEntity
import com.playsay.aitutor.entity.DialogCreditAccountEntity
import com.playsay.aitutor.repo.ConversationSessionRepository
import com.playsay.aitutor.repo.SessionEventRepository
import com.playsay.aitutor.repo.LearnerVocabularyEntryRepository
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AiTutorSessionServiceTest {
    private val sessions = Mockito.mock(ConversationSessionRepository::class.java)
    private val events = Mockito.mock(SessionEventRepository::class.java)
    private val realtime = Mockito.mock(RealtimeCredentialService::class.java)
    private val allowances = Mockito.mock(DialogAllowanceService::class.java).also {
        Mockito.`when`(it.currentAllowance("student-1")).thenReturn(
            DialogAllowanceResponse(true, 1, true, 600, DialogAllowanceNextAction.NONE),
        )
    }
    private val agePolicies = Mockito.mock(LearnerAgePolicyService::class.java).also {
        Mockito.`when`(it.resolve("student-1")).thenReturn(AgePolicy.ADULT)
    }
    private val vocabulary = Mockito.mock(LearnerVocabularyEntryRepository::class.java)
    private val now = Instant.parse("2026-07-14T12:00:00Z")
    private val service = AiTutorSessionService(
        AiTutorCatalogService(),
        sessions,
        events,
        realtime,
        agePolicies,
        allowances,
        jacksonObjectMapper(),
        vocabulary,
        Clock.fixed(now, ZoneOffset.UTC),
    )

    @Test
    fun `live session consumes one dialog and receives a ten minute expiry`() {
        val account = DialogCreditAccountEntity(UUID.randomUUID(), remainingDialogs = 1)
        val requestId = UUID.randomUUID()
        Mockito.`when`(allowances.prepareForSession("student-1", requestId)).thenReturn(DialogSessionPreparation(account))
        Mockito.`when`(sessions.saveAndFlush(Mockito.any(ConversationSessionEntity::class.java))).thenAnswer { it.arguments[0] }
        Mockito.`when`(sessions.save(Mockito.any(ConversationSessionEntity::class.java))).thenAnswer { it.arguments[0] }
        Mockito.`when`(realtime.create(Mockito.anyString(), Mockito.anyString())).thenReturn(
            RealtimeCredentialsResponse(true, "secret", now.plusSeconds(60), "gpt-realtime-2.1", "coral"),
        )

        val response = service.create(
            "student-1",
            CreateSessionRequest("maya", "meet-someone", clientRequestId = requestId),
        )

        assertEquals(600, java.time.Duration.between(response.startedAt, response.expiresAt!!).seconds)
        assertTrue(response.realtime?.available == true)
        Mockito.verify(allowances).consume(account, "student-1", response.id)
        val sessionCaptor = ArgumentCaptor.forClass(ConversationSessionEntity::class.java)
        Mockito.verify(sessions).save(sessionCaptor.capture())
        assertTrue(sessionCaptor.value.dialogCreditConsumed)
    }

    @Test
    fun `stub session does not consume a dialog`() {
        val account = DialogCreditAccountEntity(UUID.randomUUID(), remainingDialogs = 1)
        Mockito.`when`(allowances.prepareForSession("student-1", null)).thenReturn(DialogSessionPreparation(account))
        Mockito.`when`(sessions.saveAndFlush(Mockito.any(ConversationSessionEntity::class.java))).thenAnswer { it.arguments[0] }
        Mockito.`when`(realtime.create(Mockito.anyString(), Mockito.anyString())).thenReturn(
            RealtimeCredentialsResponse(false, model = "gpt-realtime-2.1", voice = "coral"),
        )

        val response = service.create("student-1", CreateSessionRequest("maya", "meet-someone"))

        assertFalse(response.realtime?.available ?: true)
        Mockito.verify(allowances).prepareForSession("student-1", null)
        Mockito.verify(allowances).currentAllowance("student-1")
        Mockito.verifyNoMoreInteractions(allowances)
    }

    @Test
    fun `realtime provider failure happens before a dialog is consumed`() {
        val account = DialogCreditAccountEntity(UUID.randomUUID(), remainingDialogs = 1)
        Mockito.`when`(allowances.prepareForSession("student-1", null)).thenReturn(DialogSessionPreparation(account))
        Mockito.`when`(sessions.saveAndFlush(Mockito.any(ConversationSessionEntity::class.java))).thenAnswer { it.arguments[0] }
        Mockito.`when`(realtime.create(Mockito.anyString(), Mockito.anyString())).thenThrow(IllegalStateException("provider unavailable"))

        assertFailsWith<IllegalStateException> {
            service.create("student-1", CreateSessionRequest("maya", "meet-someone"))
        }

        Mockito.verify(allowances).prepareForSession("student-1", null)
        Mockito.verifyNoMoreInteractions(allowances)
    }

    @Test
    fun `same client request resumes without a second debit`() {
        val requestId = UUID.randomUUID()
        val existing = activeSession().also {
            it.clientRequestId = requestId
            it.expiresAt = now.plusSeconds(300)
            it.dialogCreditConsumed = true
        }
        Mockito.`when`(sessions.findBySubjectAndClientRequestId("student-1", requestId)).thenReturn(existing)
        Mockito.`when`(realtime.create(Mockito.anyString(), Mockito.anyString())).thenReturn(
            RealtimeCredentialsResponse(true, "retry-secret", now.plusSeconds(60), "gpt-realtime-2.1", "coral"),
        )

        val response = service.create(
            "student-1",
            CreateSessionRequest("maya", "cafe-order", FeedbackMode.EVERY_TURN, clientRequestId = requestId),
        )

        assertEquals(existing.id, response.id)
        Mockito.verify(allowances).currentAllowance("student-1")
        Mockito.verifyNoMoreInteractions(allowances)
    }

    @Test
    fun `accepted answer does not require a replacement phrase`() {
        val session = activeSession()
        Mockito.`when`(sessions.findByIdAndSubject(session.id, "student-1")).thenReturn(session)
        Mockito.`when`(events.existsBySessionIdAndClientEventId(session.id, "event-1")).thenReturn(false)
        Mockito.`when`(events.save(any())).thenAnswer { it.arguments[0] }

        service.appendEvent(
            "student-1",
            session.id,
            SessionEventRequest(
                "event-1",
                SessionEventType.TURN_EVALUATION,
                TurnEvaluationRequest("turn-1", TurnVerdict.ACCEPTED, GoalResult.MET, "I'd like tea, please.", category = LanguageIssueCategory.CLARITY, encouragement = "Clear and polite."),
            ),
        )

        Mockito.verify(events).save(any())
    }

    @Test
    fun `improve answer requires replacement and explanation`() {
        val session = activeSession()
        Mockito.`when`(sessions.findByIdAndSubject(session.id, "student-1")).thenReturn(session)

        assertFailsWith<IllegalArgumentException> {
            service.appendEvent(
                "student-1",
                session.id,
                SessionEventRequest(
                    "event-2",
                    SessionEventType.TURN_EVALUATION,
                    TurnEvaluationRequest("turn-2", TurnVerdict.IMPROVE, GoalResult.PARTIAL, "I want tea.", category = LanguageIssueCategory.GRAMMAR, encouragement = "Good start."),
                ),
            )
        }
    }

    private fun activeSession() = ConversationSessionEntity(
        id = UUID.randomUUID(),
        subject = "student-1",
        personaId = "maya",
        scenarioId = "cafe-order",
        feedbackMode = FeedbackMode.EVERY_TURN.name,
        agePolicy = AgePolicy.ADULT.name,
        startedAt = now,
        expiresAt = now.plusSeconds(600),
    )
}
