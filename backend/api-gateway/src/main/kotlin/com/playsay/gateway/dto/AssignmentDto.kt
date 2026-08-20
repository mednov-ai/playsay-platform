package com.playsay.gateway.dto

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class HomeworkAssignmentRequest(
    val materialId: UUID,
    @field:ArraySchema(minItems = 1, maxItems = 100, schema = Schema(maxLength = 255))
    val studentSubjects: List<String>,
    @field:Schema(maxLength = 160, nullable = true)
    val title: String? = null,
    @field:Schema(maxLength = 2_000, nullable = true)
    val instructions: String? = null,
    @field:Schema(nullable = true)
    val dueAt: Instant? = null,
)

data class LessonHomeworkRequest(
    @field:ArraySchema(maxItems = 100, schema = Schema(maxLength = 255), arraySchema = Schema(nullable = true))
    val studentSubjects: List<String>? = null,
    @field:Schema(maxLength = 160, nullable = true)
    val title: String? = null,
    @field:Schema(maxLength = 2_000, nullable = true)
    val instructions: String? = null,
    @field:Schema(nullable = true)
    val dueAt: Instant? = null,
)

data class VocabularyHomeworkRequest(
    @field:ArraySchema(minItems = 1, maxItems = 100, schema = Schema(maxLength = 255))
    val studentSubjects: List<String>,
    @field:Schema(maxLength = 160, nullable = true)
    val title: String? = null,
    @field:Schema(maxLength = 2_000, nullable = true)
    val instructions: String? = null,
    @field:Schema(nullable = true)
    val dueAt: Instant? = null,
    @field:Schema(allowableValues = ["QUICK", "BALANCED", "WRITING", "KEYBOARD"])
    val mode: String = "BALANCED",
    val wordLimit: Int = 10,
    @field:ArraySchema(maxItems = 100)
    val pinnedEntryIds: List<UUID> = emptyList(),
    @field:ArraySchema(maxItems = 100)
    val excludedEntryIds: List<UUID> = emptyList(),
    @field:Schema(nullable = true, description = "Completed LIVE practice whose unfinished immutable items must be continued at home")
    val sourcePracticeId: UUID? = null,
    @field:Schema(nullable = true, description = "Immutable vocabulary preview plan to publish without regeneration")
    val planId: UUID? = null,
    @field:Schema(nullable = true)
    val planRevision: Long? = null,
    @field:Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val completionPolicy: VocabularyHomeworkCompletionPolicy = VocabularyHomeworkCompletionPolicy.MEANINGFUL_ACTIVITY,
    @field:Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    @field:Valid val completionThresholds: VocabularyCompletionThresholds = VocabularyCompletionThresholds(),
    @field:Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val keyMode: VocabularyKeyMode = VocabularyKeyMode.WHOLE_WORDS,
    @field:Valid @field:Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val keyNgramSettings: VocabularyKeyNgramSettings = VocabularyKeyNgramSettings(),
)

enum class VocabularyHomeworkCompletionPolicy { MEANINGFUL_ACTIVITY, COMPLETE_SESSION, MASTERY_TARGET, TEACHER_REVIEW }
enum class VocabularyHomeworkReviewAction { ACCEPT, RETURN }
enum class VocabularyKeyMode { WHOLE_WORDS, CHARACTER_NGRAMS, MIXED }

data class VocabularyKeyNgramSettings(
    @field:Min(2) @field:Max(8) val minLength: Int = 2,
    @field:Min(2) @field:Max(8) val maxLength: Int = 5,
    @field:Min(1) @field:Max(200) val targetLimit: Int = 64,
    @field:Min(1) @field:Max(4) val maxRepetitions: Int = 2,
)

data class VocabularyCompletionThresholds(
    @field:Min(1) @field:Max(100) val distinctGradedPrompts: Int = 8,
    @field:Min(1) @field:Max(30) val distinctEntries: Int = 4,
    @field:Min(1) @field:Max(100) val masteryPercent: Int = 80,
    @field:Size(max = 64) @field:Schema(maxLength = 64) val policyVersion: String = "vocabulary-homework-v1",
)

data class VocabularyHomeworkReviewRequest(
    val action: VocabularyHomeworkReviewAction,
    @field:Size(max = 1_000) @field:Schema(maxLength = 1_000, nullable = true) val note: String? = null,
)

data class AssignmentSummaryResponse(
    val id: UUID,
    val materialId: UUID?,
    val materialTitle: String?,
    @field:Schema(allowableValues = ["MATERIAL", "VOCABULARY_PRACTICE"])
    val contentKind: String = "MATERIAL",
    val activityRef: UUID? = null,
    val lessonId: UUID?,
    val sourceLessonId: UUID?,
    val title: String,
    val instructions: String?,
    val type: String,
    val maxScore: BigDecimal?,
    val dueAt: Instant?,
    val status: String,
    val recipientCount: Int,
    val submittedCount: Int,
    val scoredCount: Int,
    val averageScore: BigDecimal?,
    val averageErrorsCount: BigDecimal?,
    val createdAt: Instant,
    val updatedAt: Instant,
    @field:Schema(nullable = true, allowableValues = ["NOT_STARTED", "DRAFT", "SUBMITTED"])
    val mySubmissionState: String? = null,
    @field:Schema(nullable = true)
    val myScore: BigDecimal? = null,
    @field:Schema(nullable = true)
    val mySubmittedAt: Instant? = null,
    @field:Schema(nullable = true)
    val mySubmissionUpdatedAt: Instant? = null,
    @field:Schema(nullable = true, allowableValues = ["NOT_STARTED", "IN_PROGRESS", "AWAITING_REVIEW", "COMPLETED", "FAILED"])
    val myActivityState: String? = null,
    @field:Schema(nullable = true)
    val myCompletionRatio: BigDecimal? = null,
    @field:Schema(nullable = true)
    val myAccuracy: BigDecimal? = null,
    @field:Schema(nullable = true)
    val myDifficultWordCount: Int? = null,
    val completionPolicy: VocabularyHomeworkCompletionPolicy? = null,
    val completionPolicyVersion: String? = null,
    val completionThresholds: VocabularyCompletionThresholds? = null,
    val myDistinctGradedPrompts: Int? = null,
    val myDistinctEntries: Int? = null,
    val myHintsUsed: Int? = null,
    val myActiveDurationMs: Long? = null,
    val myMasteryRatio: BigDecimal? = null,
    val myReviewState: String? = null,
)

data class AssignmentRecipientProgressResponse(
    val assignmentId: UUID,
    val studentUserId: UUID,
    val studentSubject: String,
    val studentName: String?,
    val submissionId: UUID?,
    val hasSubmission: Boolean,
    val submitted: Boolean,
    val score: BigDecimal?,
    val maxScore: BigDecimal?,
    val scoreRatio: BigDecimal?,
    val errorsCount: Int?,
    val progressTone: Int?,
    val showGroupIndicator: Boolean,
    val groupAverageScore: BigDecimal?,
    val groupAverageErrorsCount: BigDecimal?,
    val relativeScoreDelta: BigDecimal?,
    val relativeErrorsDelta: BigDecimal?,
    val submittedAt: Instant?,
    val updatedAt: Instant?,
    val activityRef: UUID? = null,
    @field:Schema(allowableValues = ["NOT_STARTED", "IN_PROGRESS", "AWAITING_REVIEW", "COMPLETED", "FAILED"])
    val activityState: String? = null,
    val completionRatio: BigDecimal? = null,
    val accuracy: BigDecimal? = null,
    val difficultWordCount: Int? = null,
    val learnerSnapshotId: UUID? = null,
    val distinctGradedPrompts: Int? = null,
    val distinctEntries: Int? = null,
    val hintsUsed: Int? = null,
    val activeDurationMs: Long? = null,
    val masteryRatio: BigDecimal? = null,
    val reviewState: String? = null,
    val reviewNote: String? = null,
    val reviewedAt: Instant? = null,
)

data class TeacherAssignmentDetailResponse(
    val assignment: AssignmentSummaryResponse,
    val recipients: List<AssignmentRecipientProgressResponse>,
)

data class StudentAssignmentDetailResponse(
    val assignment: AssignmentSummaryResponse,
    val material: LessonMaterialResponse,
    val submission: AssignmentSubmissionResponse,
)

data class TeacherAssignmentSubmissionDetailResponse(
    val material: LessonMaterialResponse,
    val submission: AssignmentSubmissionResponse,
)

data class AssignmentSubmissionResponse(
    val id: UUID,
    val assignmentId: UUID,
    val lessonId: UUID?,
    val materialId: UUID,
    val userId: UUID,
    val userSubject: String?,
    val userName: String?,
    val content: JsonNode,
    val score: BigDecimal?,
    val errorsCount: Int?,
    val progressTone: Int?,
    val submittedAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class StudentVocabularyAssignmentDetailResponse(
    val assignment: AssignmentSummaryResponse,
    val practiceId: UUID,
    val sessionId: UUID,
    val learnerSnapshotId: UUID = sessionId,
)

data class VocabularyAssignmentPreparationResponse(
    val practiceId: UUID,
    val sessions: List<VocabularyAssignmentSessionRef>,
)

data class VocabularyAssignmentPreparationRequest(
    val actorSubject: String,
    val assignmentId: UUID,
    val ownerSubjects: List<String>,
    val mode: String,
    val wordLimit: Int,
    val pinnedEntryIds: List<UUID>,
    val excludedEntryIds: List<UUID>,
    val sourcePracticeId: UUID?,
    val planId: UUID?,
    val planRevision: Long?,
    val completionPolicy: VocabularyHomeworkCompletionPolicy,
    val completionThresholds: VocabularyCompletionThresholds,
    val keyMode: VocabularyKeyMode,
    val keyNgramSettings: VocabularyKeyNgramSettings,
)

data class VocabularyAssignmentSessionRef(
    val sessionId: UUID,
    val ownerSubject: String,
)

data class VocabularyAssignmentProgressUpdateRequest(
    val eventId: UUID,
    val sessionId: UUID,
    val ownerSubject: String,
    val revision: Long,
    @field:Schema(allowableValues = ["NOT_STARTED", "IN_PROGRESS", "AWAITING_REVIEW", "COMPLETED", "FAILED"])
    val state: String,
    val completionRatio: BigDecimal?,
    val accuracy: BigDecimal?,
    val difficultWordCount: Int?,
    val learnerSnapshotId: UUID? = null,
    val distinctGradedPrompts: Int? = null,
    val distinctEntries: Int? = null,
    val hintsUsed: Int? = null,
    val activeDurationMs: Long? = null,
    val masteryRatio: BigDecimal? = null,
    val completionPolicy: VocabularyHomeworkCompletionPolicy? = null,
    val completionPolicyVersion: String? = null,
    val updatedAt: Instant,
)
