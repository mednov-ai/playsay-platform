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
    val participantSubjects: List<String> = emptyList(),
)

data class ScheduledLessonParticipantResponse(
    val subject: String,
    val username: String?,
    val displayName: String?,
    val attendanceStatus: String?,
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
    val livekitRoomName: String?,
    val participants: List<ScheduledLessonParticipantResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)
