package com.playsay.gateway.service

import com.playsay.gateway.dto.ScheduledLessonParticipantResponse
import com.playsay.gateway.dto.ScheduledLessonResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonParticipantRow
import com.playsay.gateway.repo.ScheduledLessonRow
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

internal data class ScheduledParticipant(
    val subject: String,
    val userId: UUID,
)

internal fun ValidatedScheduledLessonRequest.sharedMaterialId(): UUID? =
    if (workMode == MetaData.LessonWorkModes.SHARED) materialId else null

internal fun JwtAuthenticationToken.requireScheduleManager() {
    if (!canManageSchedule()) {
        throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
    }
}

internal fun JwtAuthenticationToken.canManageSchedule(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN }

internal fun JwtAuthenticationToken.isScheduleAdmin(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }

internal fun ScheduledLessonRow.toResponse(participants: List<LessonParticipantRow>): ScheduledLessonResponse =
    ScheduledLessonResponse(
        id = id,
        lessonTemplateId = lessonTemplateId,
        materialId = materialId,
        inheritTemplateMaterial = inheritTemplateMaterial,
        materialTitle = materialTitle,
        courseId = courseId,
        courseTitle = courseTitle,
        lessonTitle = lessonTitle,
        teacherSubject = teacherSubject,
        teacherName = teacherName,
        scheduledStart = scheduledStart,
        scheduledEnd = scheduledEnd,
        status = status,
        type = type,
        workMode = workMode,
        recurrenceSeriesId = recurrenceSeriesId,
        recurrenceIndex = recurrenceIndex,
        recurrenceTotal = recurrenceTotal,
        livekitRoomName = livekitRoomName,
        participants = participants.map { participant -> participant.toResponse() },
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun ScheduledLessonRow.isVisibleToParticipant(now: Instant): Boolean =
    status !in expiredParticipantStatuses && (scheduledEnd == null || !scheduledEnd.isBefore(lessonAccessEndsAfter(now)))

private fun LessonParticipantRow.toResponse(): ScheduledLessonParticipantResponse =
    ScheduledLessonParticipantResponse(
        subject = subject,
        username = username,
        displayName = displayName,
        attendanceStatus = attendanceStatus,
        materialId = materialId,
        materialTitle = materialTitle,
    )

internal val expiredParticipantStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
internal const val SCHEDULE_CREATE_AUDIT = "SCHEDULE_CREATE"
internal const val SCHEDULE_UPDATE_AUDIT = "SCHEDULE_UPDATE"
