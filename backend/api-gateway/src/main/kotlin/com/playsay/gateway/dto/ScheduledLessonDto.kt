package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant
import java.util.UUID

data class ScheduledLessonRequest(
    val lessonTemplateId: UUID? = null,
    val materialId: UUID? = null,
    val scheduledStart: Instant? = null,
    val scheduledEnd: Instant? = null,
    @field:Schema(allowableValues = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    val status: String = "SCHEDULED",
    @field:Schema(allowableValues = ["INDIVIDUAL", "GROUP"])
    val type: String = "GROUP",
    @field:Schema(allowableValues = ["SHARED", "PARALLEL"])
    val workMode: String = "SHARED",
    val participantSubjects: List<String> = emptyList(),
    val participantAssignments: List<ScheduledLessonMaterialAssignmentRequest> = emptyList(),
    val recurrence: ScheduledLessonRecurrenceRequest? = null,
)

data class ScheduledLessonMaterialAssignmentRequest(
    val materialId: UUID,
    val participantSubjects: List<String> = emptyList(),
)

data class ScheduledLessonRecurrenceRequest(
    @field:Schema(allowableValues = ["WEEKLY_COUNT", "WEEKLY_BY_WEEK"])
    val mode: String = "WEEKLY_COUNT",
    val count: Int = 2,
    val weekdays: List<String> = emptyList(),
    val weekdayTimes: Map<String, String> = emptyMap(),
    val timeZone: String = "UTC",
)

data class ScheduledLessonParticipantResponse(
    val subject: String,
    val username: String?,
    val displayName: String?,
    val attendanceStatus: String?,
    val materialId: UUID? = null,
    val materialTitle: String? = null,
)

data class ScheduledLessonResponse(
    val id: UUID,
    val lessonTemplateId: UUID?,
    val materialId: UUID?,
    val materialTitle: String?,
    val courseId: UUID?,
    val courseTitle: String?,
    val lessonTitle: String?,
    val teacherSubject: String?,
    val teacherName: String?,
    val scheduledStart: Instant?,
    val scheduledEnd: Instant?,
    val status: String,
    val type: String,
    val workMode: String = "SHARED",
    val recurrenceSeriesId: UUID? = null,
    val recurrenceIndex: Int? = null,
    val recurrenceTotal: Int? = null,
    val livekitRoomName: String?,
    val participants: List<ScheduledLessonParticipantResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)
