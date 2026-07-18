package com.playsay.gateway.service

import com.playsay.gateway.dto.ScheduledLessonResponse
import com.playsay.gateway.dto.ScheduledLessonScheduleUpdateRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.realtime.LessonChangedEvent
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ScheduledLessonRescheduleService(
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val scheduledLessonStore: ScheduledLessonStore,
    private val authorizationService: ScheduledLessonAuthorizationService,
    private val userProfileStore: UserProfileStore,
    private val studentAccessService: ScheduledLessonStudentAccessService,
    private val lessonReminderService: LessonReminderService,
    private val eventPublisher: ApplicationEventPublisher,
) {
    @Transactional
    fun reschedule(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: ScheduledLessonScheduleUpdateRequest,
    ): ScheduledLessonResponse {
        authentication.requireScheduleManager()
        val lesson = lessonRepo.lockById(lessonId)
            ?: notFound()
        if (!authorizationService.canManageLesson(authentication, lessonId)) {
            notFound()
        }
        if (lesson.status in closedRescheduleStatuses) {
            throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.SCHEDULED_LESSON_CANNOT_RESCHEDULE)
        }
        validateInterval(request.scheduledStart, request.scheduledEnd)

        val actorUserId = userProfileStore.currentUserId(authentication)
        val sourceId = lesson.recurrenceSeriesId ?: lesson.id
        val previousStart = lesson.scheduledStart
        val previousEnd = lesson.scheduledEnd
        val scheduleChanged = previousStart != request.scheduledStart || previousEnd != request.scheduledEnd
        val now = Instant.now()

        lesson.scheduledStart = request.scheduledStart
        lesson.scheduledEnd = request.scheduledEnd
        if (lesson.status == MetaData.LessonStatuses.IN_PROGRESS && !lesson.isInsideAccessWindow(now)) {
            lesson.status = MetaData.LessonStatuses.SCHEDULED
            lesson.actualStart = null
            lesson.actualEnd = null
        }
        lesson.updatedAt = now
        lessonRepo.saveAndFlush(lesson)

        val participantUserIds = lessonParticipantRepo.findParticipantRowsByLessonIds(listOf(lessonId))
            .map { participant -> participant.userId }
        lessonReminderService.rebuildPendingReminders(
            lessonId = lessonId,
            teacherUserId = lesson.teacherUserId,
            participantUserIds = participantUserIds,
            scheduledStart = lesson.scheduledStart,
            status = lesson.status,
            now = now,
        )
        if (scheduleChanged) {
            lessonReminderService.enqueueRescheduleNotifications(
                lessonId = lessonId,
                participantUserIds = participantUserIds,
                previousScheduledStart = previousStart,
                previousScheduledEnd = previousEnd,
                scheduledStart = request.scheduledStart,
                scheduledEnd = request.scheduledEnd,
                now = now,
            )
        }
        studentAccessService.synchronize(
            sourceId = sourceId,
            lessonTeacherUserId = requireNotNull(lesson.teacherUserId),
            actorUserId = actorUserId,
            allowNewScheduleDelegations = authentication.isScheduleAdmin(),
            auditAction = SCHEDULE_UPDATE_AUDIT,
        )

        return scheduledLessonStore.get(authentication, lessonId).also { updated ->
            eventPublisher.publishEvent(LessonChangedEvent(updated))
        }
    }

    private fun com.playsay.gateway.entity.LessonEntity.isInsideAccessWindow(now: Instant): Boolean =
        isLessonInsideAccessWindow(status, scheduledStart, scheduledEnd, now, closedRescheduleStatuses)

    private fun validateInterval(scheduledStart: Instant, scheduledEnd: Instant) {
        if (!scheduledEnd.isAfter(scheduledStart)) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.SCHEDULED_END_BEFORE_START)
        }
        if (Duration.between(scheduledStart, scheduledEnd).toMinutes() !in MIN_DURATION_MINUTES..MAX_DURATION_MINUTES) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.SCHEDULED_LESSON_DURATION_OUT_OF_RANGE)
        }
    }

    private fun notFound(): Nothing =
        throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)

    private companion object {
        const val MIN_DURATION_MINUTES = 10L
        const val MAX_DURATION_MINUTES = 180L
        val closedRescheduleStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
    }
}
