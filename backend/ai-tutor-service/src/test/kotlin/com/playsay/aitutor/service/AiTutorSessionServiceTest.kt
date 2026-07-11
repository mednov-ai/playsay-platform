package com.playsay.aitutor.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.aitutor.dto.*
import com.playsay.aitutor.entity.ConversationSessionEntity
import com.playsay.aitutor.repo.ConversationSessionRepository
import com.playsay.aitutor.repo.SessionEventRepository
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertFailsWith

class AiTutorSessionServiceTest {
    private val sessions = Mockito.mock(ConversationSessionRepository::class.java)
    private val events = Mockito.mock(SessionEventRepository::class.java)
    private val realtime = Mockito.mock(RealtimeCredentialService::class.java)
    private val agePolicies = Mockito.mock(LearnerAgePolicyService::class.java).also {
        Mockito.`when`(it.resolve("student-1")).thenReturn(AgePolicy.ADULT)
    }
    private val service = AiTutorSessionService(AiTutorCatalogService(), sessions, events, realtime, agePolicies, jacksonObjectMapper())

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
    )
}
