package com.playsay.aitutor.dto

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

enum class FeedbackMode { EVERY_TURN, SIGNIFICANT, SESSION_END }
enum class AgePolicy { CHILD, TEEN, ADULT }
enum class SessionStatus { ACTIVE, COMPLETED, FAILED }
enum class SessionEventType { TURN_EVALUATION }
enum class TurnVerdict { ACCEPTED, IMPROVE }
enum class GoalResult { MET, PARTIAL, NOT_MET }
enum class LanguageIssueCategory { GRAMMAR, VOCABULARY, RELEVANCE, CLARITY }

data class TutorPersonaResponse(
    val id: String,
    val name: String,
    val voice: String,
    val accent: String,
    val avatarAsset: String,
    val agePolicies: Set<AgePolicy>,
)

data class ConversationScenarioResponse(
    val id: String,
    val title: String,
    val description: String,
    val cefrLevel: String,
    val category: String,
    val conversationGoal: String,
    val successCriteria: List<String>,
    val turnGoals: List<String>,
    val agePolicies: Set<AgePolicy>,
    val freeConversation: Boolean = false,
)

data class CreateSessionRequest(
    @field:NotBlank val personaId: String,
    @field:NotBlank val scenarioId: String,
    val feedbackMode: FeedbackMode = FeedbackMode.SIGNIFICANT,
    @field:Size(max = 240) val freeTopic: String? = null,
)

data class RealtimeCredentialsResponse(
    val available: Boolean,
    val clientSecret: String? = null,
    val expiresAt: Instant? = null,
    val model: String,
    val voice: String,
)

data class ConversationSessionResponse(
    val id: UUID,
    val status: SessionStatus,
    val personaId: String,
    val scenarioId: String,
    val feedbackMode: FeedbackMode,
    val startedAt: Instant,
    val completedAt: Instant?,
    val realtime: RealtimeCredentialsResponse? = null,
    val summary: SessionSummaryResponse? = null,
)

data class SessionSummaryResponse(
    val acceptedTurns: Int,
    val improvedTurns: Int,
    val goalsMet: Int,
    val recurringIssues: List<LanguageIssueCategory>,
    val recommendedScenarioId: String,
)

data class SessionEventRequest(
    @field:NotBlank @field:Size(max = 128) val clientEventId: String,
    val type: SessionEventType,
    @field:Valid val turnEvaluation: TurnEvaluationRequest,
)

data class TurnEvaluationRequest(
    @field:NotBlank @field:Size(max = 128) val clientTurnId: String,
    val verdict: TurnVerdict,
    val goalResult: GoalResult,
    @field:NotBlank @field:Size(max = 2_000) val original: String,
    @field:Size(max = 2_000) val improved: String = "",
    @field:Size(max = 1_000) val explanation: String = "",
    val category: LanguageIssueCategory,
    @field:NotBlank @field:Size(max = 500) val encouragement: String,
)

data class LearnerProgressResponse(
    val completedSessions: Long,
    val minutesSpoken: Long,
    val cefrEstimate: String?,
    val activeGoals: List<String>,
    val recurringTargets: List<String>,
)

data class AssessmentRequest(
    @field:NotBlank @field:Size(max = 16_000) val evidence: String,
    val goals: List<String> = emptyList(),
)

data class AssessmentResponse(
    val cefrRange: String,
    val confidence: Double,
    val recommendedScenarioIds: List<String>,
)
