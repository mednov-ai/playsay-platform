package com.playsay.aitutor.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.aitutor.dto.*
import com.playsay.aitutor.entity.ConversationSessionEntity
import com.playsay.aitutor.entity.SessionEventEntity
import com.playsay.aitutor.entity.StoredSessionStatus
import com.playsay.aitutor.repo.ConversationSessionRepository
import com.playsay.aitutor.repo.SessionEventRepository
import com.playsay.aitutor.repo.LearnerVocabularyEntryRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Duration
import java.util.UUID

@Service
class AiTutorSessionService(
    private val catalog: AiTutorCatalogService,
    private val sessions: ConversationSessionRepository,
    private val events: SessionEventRepository,
    private val realtime: RealtimeCredentialService,
    private val agePolicies: LearnerAgePolicyService,
    private val allowances: DialogAllowanceService,
    private val objectMapper: ObjectMapper,
    private val vocabularyEntries: LearnerVocabularyEntryRepository,
    private val clock: Clock = Clock.systemUTC(),
) {
    @Transactional
    fun create(subject: String, request: CreateSessionRequest): ConversationSessionResponse {
        val agePolicy = agePolicies.resolve(subject)
        val persona = requireNotNull(catalog.persona(request.personaId, agePolicy)) { "Persona is unavailable for this age policy" }
        val scenario = requireNotNull(catalog.scenario(request.scenarioId, agePolicy)) { "Scenario is unavailable for this age policy" }
        val vocabularyGoals = runCatching { vocabularyEntries.findTop5ByOwnerSubjectAndStatusOrderByUpdatedAtDesc(subject).map { it.sourceText } }.getOrDefault(emptyList())
        require(scenario.freeConversation || request.freeTopic.isNullOrBlank()) { "Free topic is supported only for free conversation" }

        request.clientRequestId
            ?.let { requestId -> sessions.findBySubjectAndClientRequestId(subject, requestId) }
            ?.let { existing ->
                return resumeIdempotent(existing, subject, persona, scenario, request, vocabularyGoals)
            }

        val preparation = allowances.prepareForSession(subject, request.clientRequestId)
        preparation.existingSession?.let { existing ->
            return resumeIdempotent(existing, subject, persona, scenario, request, vocabularyGoals)
        }
        val account = preparation.account
        val startedAt = clock.instant()
        val entity = sessions.saveAndFlush(
            ConversationSessionEntity(
                subject = subject,
                personaId = persona.id,
                scenarioId = scenario.id,
                feedbackMode = request.feedbackMode.name,
                agePolicy = agePolicy.name,
                freeTopic = request.freeTopic?.trim()?.ifBlank { null },
                clientRequestId = request.clientRequestId,
                startedAt = startedAt,
                expiresAt = startedAt.plus(DialogAllowanceService.DIALOG_DURATION),
                vocabularyGoalsJson = objectMapper.writeValueAsString(vocabularyGoals),
            ),
        )
        val credentials = realtime.create(persona.voice, instructions(persona, scenario, request, vocabularyGoals))
        if (credentials.available && account != null) {
            allowances.consume(account, subject, entity.id)
            entity.dialogCreditConsumed = true
            sessions.save(entity)
        }
        return entity.toResponse(credentials, allowances.currentAllowance(subject))
    }

    @Transactional
    fun appendEvent(subject: String, sessionId: UUID, request: SessionEventRequest): ConversationSessionResponse {
        val session = ownedActiveSession(subject, sessionId)
        validateEvaluation(request.turnEvaluation)
        if (!events.existsBySessionIdAndClientEventId(sessionId, request.clientEventId)) {
            events.save(
                SessionEventEntity(
                    sessionId = sessionId,
                    clientEventId = request.clientEventId,
                    type = request.type.name,
                    payloadJson = objectMapper.writeValueAsString(request.turnEvaluation),
                ),
            )
        }
        return session.toResponse(allowance = allowances.currentAllowance(subject))
    }

    @Transactional
    fun finish(subject: String, sessionId: UUID): ConversationSessionResponse {
        val session = sessions.findByIdAndSubject(sessionId, subject) ?: error("Session not found")
        if (session.status == StoredSessionStatus.COMPLETED || session.status == StoredSessionStatus.EXPIRED) {
            return session.toResponse(allowance = allowances.currentAllowance(subject))
        }
        val completedAt = clock.instant()
        if (!DialogAllowanceService.effectiveExpiry(session.startedAt, session.expiresAt).isAfter(completedAt)) {
            expire(session)
            return session.toResponse(allowance = allowances.currentAllowance(subject))
        }
        session.status = StoredSessionStatus.COMPLETED
        session.completedAt = completedAt
        session.durationSeconds = Duration.between(session.startedAt, completedAt).seconds.coerceAtLeast(0)
        session.summaryJson = objectMapper.writeValueAsString(buildSummary(session))
        return sessions.save(session).toResponse(allowance = allowances.currentAllowance(subject))
    }

    fun progress(subject: String): LearnerProgressResponse {
        val completed = sessions.findAllBySubjectAndStatus(subject, StoredSessionStatus.COMPLETED)
        return LearnerProgressResponse(
            completedSessions = completed.size.toLong(),
            minutesSpoken = completed.sumOf { it.durationSeconds } / 60,
            cefrEstimate = null,
            activeGoals = emptyList(),
            recurringTargets = emptyList(),
        )
    }

    fun assess(request: AssessmentRequest): AssessmentResponse {
        val wordCount = request.evidence.trim().split(Regex("\\s+")).count { it.isNotBlank() }
        val range = when {
            wordCount < 25 -> "A1–A2"
            wordCount < 80 -> "A2–B1"
            else -> "B1–B2"
        }
        return AssessmentResponse(range, confidence = 0.45, recommendedScenarioIds = listOf("meet-someone", "cafe-order"))
    }

    private fun ownedActiveSession(subject: String, id: UUID): ConversationSessionEntity =
        (sessions.findByIdAndSubject(id, subject) ?: error("Session not found")).also { session ->
            if (session.status == StoredSessionStatus.ACTIVE &&
                !DialogAllowanceService.effectiveExpiry(session.startedAt, session.expiresAt).isAfter(clock.instant())
            ) {
                expire(session)
            }
            check(session.status == StoredSessionStatus.ACTIVE) { "Session is not active" }
        }

    private fun resumeIdempotent(
        session: ConversationSessionEntity,
        subject: String,
        persona: TutorPersonaResponse,
        scenario: ConversationScenarioResponse,
        request: CreateSessionRequest,
        vocabularyGoals: List<String>,
    ): ConversationSessionResponse {
        if (!session.matches(request)) {
            throw AiTutorResponseException(
                org.springframework.http.HttpStatus.CONFLICT,
                AiTutorErrorCodes.DIALOG_REQUEST_CONFLICT,
                "The client request id was already used for another dialog",
            )
        }
        if (session.status != StoredSessionStatus.ACTIVE ||
            !DialogAllowanceService.effectiveExpiry(session.startedAt, session.expiresAt).isAfter(clock.instant())
        ) {
            if (session.status == StoredSessionStatus.ACTIVE) expire(session)
            throw AiTutorResponseException(
                org.springframework.http.HttpStatus.CONFLICT,
                AiTutorErrorCodes.DIALOG_REQUEST_CONFLICT,
                "The idempotent dialog request is no longer active",
            )
        }
        val account = if (session.dialogCreditConsumed) null else allowances.prepareForSession(subject, request.clientRequestId).account
        val credentials = realtime.create(persona.voice, instructions(persona, scenario, request, vocabularyGoals))
        if (credentials.available && !session.dialogCreditConsumed && account != null) {
            allowances.consume(account, subject, session.id)
            session.dialogCreditConsumed = true
            sessions.save(session)
        }
        return session.toResponse(credentials, allowances.currentAllowance(subject))
    }

    private fun expire(session: ConversationSessionEntity) {
        val expiresAt = DialogAllowanceService.effectiveExpiry(session.startedAt, session.expiresAt)
        session.status = StoredSessionStatus.EXPIRED
        session.completedAt = expiresAt
        session.durationSeconds = Duration.between(session.startedAt, expiresAt).seconds.coerceAtLeast(0)
        sessions.save(session)
    }

    private fun ConversationSessionEntity.matches(request: CreateSessionRequest): Boolean =
        personaId == request.personaId &&
            scenarioId == request.scenarioId &&
            feedbackMode == request.feedbackMode.name &&
            freeTopic == request.freeTopic?.trim()?.ifBlank { null }

    private fun validateEvaluation(evaluation: TurnEvaluationRequest) {
        if (evaluation.verdict == TurnVerdict.IMPROVE) {
            require(evaluation.improved.isNotBlank()) { "Improved answer is required for IMPROVE" }
            require(evaluation.explanation.isNotBlank()) { "Explanation is required for IMPROVE" }
        }
    }

    private fun buildSummary(session: ConversationSessionEntity): SessionSummaryResponse {
        val evaluations = events.findAllBySessionIdOrderByCreatedAtAsc(session.id).mapNotNull { event ->
            runCatching { objectMapper.readValue(event.payloadJson, TurnEvaluationRequest::class.java) }.getOrNull()
        }
        val recurringIssues = evaluations.asSequence()
            .filter { it.verdict == TurnVerdict.IMPROVE }
            .groupingBy { it.category }
            .eachCount()
            .entries
            .sortedByDescending { it.value }
            .take(3)
            .map { it.key }
        return SessionSummaryResponse(
            acceptedTurns = evaluations.count { it.verdict == TurnVerdict.ACCEPTED },
            improvedTurns = evaluations.count { it.verdict == TurnVerdict.IMPROVE },
            goalsMet = evaluations.count { it.goalResult == GoalResult.MET },
            recurringIssues = recurringIssues,
            recommendedScenarioId = session.scenarioId,
        )
    }

    private fun instructions(persona: TutorPersonaResponse, scenario: ConversationScenarioResponse, request: CreateSessionRequest, vocabularyGoals: List<String>): String =
        """
        You are ${persona.name}, a supportive English conversation tutor. Stay in English unless the learner asks for brief help.
        Scenario: ${request.freeTopic?.takeIf { it.isNotBlank() } ?: scenario.title}. Target level: ${scenario.cefrLevel}.
        Conversation goal: ${scenario.conversationGoal}. Success criteria: ${scenario.successCriteria.joinToString("; ")}.
        Turn goals in order: ${scenario.turnGoals.joinToString("; ")}.
        Learner vocabulary goals: ${vocabularyGoals.joinToString("; ").ifBlank { "none" }}. Invite natural use of these words when relevant; never force an unnatural turn.
        Evaluate meaning and task completion, not exact wording. Multiple semantically correct answers are valid.
        Use ACCEPTED when the answer is relevant, understandable, and sufficiently correct even if a native speaker might phrase it differently.
        Use IMPROVE only for a material grammar/vocabulary problem, unclear meaning, or failure to address the current goal.
        Feedback mode: ${request.feedbackMode}.
        For EVERY_TURN call evaluate_learner_turn after every completed learner turn. For SIGNIFICANT call it only for IMPROVE. For SESSION_END call it after every completed turn but never mention the result aloud or interrupt the conversation.
        For CHILD and TEEN policies, keep topics and language age-appropriate and never request personal contact details.
        Never evaluate accent or pronunciation. If audio is unclear, ask the learner to repeat and do not evaluate that turn.
        """.trimIndent()

    private fun ConversationSessionEntity.toResponse(
        credentials: RealtimeCredentialsResponse? = null,
        allowance: DialogAllowanceResponse? = null,
    ) = ConversationSessionResponse(
        id = id,
        status = SessionStatus.valueOf(status.name),
        personaId = personaId,
        scenarioId = scenarioId,
        feedbackMode = FeedbackMode.valueOf(feedbackMode),
        startedAt = startedAt,
        expiresAt = DialogAllowanceService.effectiveExpiry(startedAt, expiresAt),
        completedAt = completedAt,
        realtime = credentials,
        summary = summaryJson.takeUnless { it == "{}" }?.let { json ->
            runCatching { objectMapper.readValue(json, SessionSummaryResponse::class.java) }.getOrNull()
        },
        vocabularyGoals = runCatching { objectMapper.readValue(vocabularyGoalsJson, Array<String>::class.java).toList() }.getOrDefault(emptyList()),
        allowance = allowance,
    )
}
