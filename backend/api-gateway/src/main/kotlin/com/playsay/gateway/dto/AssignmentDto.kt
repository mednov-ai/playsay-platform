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

data class AssignmentSummaryResponse(
    val id: UUID,
    val materialId: UUID,
    val materialTitle: String,
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
