package com.playsay.gateway.repo

import java.time.Instant
import java.util.UUID

data class ScheduledLessonRow(
    val id: UUID,
    val lessonTemplateId: UUID?,
    val inheritTemplateMaterial: Boolean,
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
    val workMode: String,
    val recurrenceSeriesId: UUID?,
    val recurrenceIndex: Int?,
    val recurrenceTotal: Int?,
    val livekitRoomName: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class LessonParticipantRow(
    val lessonId: UUID,
    val userId: UUID,
    val subject: String,
    val username: String?,
    val displayName: String?,
    val attendanceStatus: String?,
    val materialId: UUID?,
    val materialTitle: String?,
)

data class ScheduledMaterialLookupRow(
    val id: UUID,
    val status: String,
    val scheduledStart: Instant?,
    val scheduledEnd: Instant?,
    val workMode: String,
    val materialId: UUID?,
)
