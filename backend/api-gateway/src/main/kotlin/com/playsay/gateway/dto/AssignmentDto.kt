package com.playsay.gateway.dto

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Schema
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
    @field:Schema(nullable = true, allowableValues = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "FAILED"])
    val myActivityState: String? = null,
    @field:Schema(nullable = true)
    val myCompletionRatio: BigDecimal? = null,
    @field:Schema(nullable = true)
    val myAccuracy: BigDecimal? = null,
    @field:Schema(nullable = true)
    val myDifficultWordCount: Int? = null,
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
    @field:Schema(allowableValues = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "FAILED"])
    val activityState: String? = null,
    val completionRatio: BigDecimal? = null,
    val accuracy: BigDecimal? = null,
    val difficultWordCount: Int? = null,
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
    @field:Schema(allowableValues = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "FAILED"])
    val state: String,
    val completionRatio: BigDecimal?,
    val accuracy: BigDecimal?,
    val difficultWordCount: Int?,
    val updatedAt: Instant,
)
