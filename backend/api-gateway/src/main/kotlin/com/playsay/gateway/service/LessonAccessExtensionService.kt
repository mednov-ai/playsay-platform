package com.playsay.gateway.service

import com.playsay.gateway.dto.LessonAccessExtensionRequest
import com.playsay.gateway.dto.ScheduledLessonResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.realtime.LessonChangedEvent
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LessonAccessExtensionService(
    private val lessonRepo: LessonRepo,
    private val authorizationService: ScheduledLessonAuthorizationService,
    private val store: ScheduledLessonStore,
    private val events: ApplicationEventPublisher,
    private val clock: Clock,
) {
    @Transactional
    fun extend(authentication: JwtAuthenticationToken, lessonId: UUID, request: LessonAccessExtensionRequest): ScheduledLessonResponse {
        authentication.requireScheduleManager()
        val lesson = lessonRepo.lockById(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        if (!authorizationService.canManageLesson(authentication, lessonId)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }
        val now = clock.instant()
        val deadline = lessonAccessDeadline(lesson.scheduledEnd, lesson.accessExtensionSeconds)
        if (lessonRepo.hasDeletingParticipant(lessonId) || lesson.status != MetaData.LessonStatuses.IN_PROGRESS ||
            deadline == null || !now.isBefore(deadline) || now.isBefore(deadline.minusSeconds(120)) ||
            lesson.accessExtensionSeconds > Int.MAX_VALUE - 600 || lesson.accessRevision == Long.MAX_VALUE ||
            request.expectedAccessRevision != lesson.accessRevision
        ) {
            throw ProjectResponseException.localized(HttpStatus.CONFLICT, "LESSON_EXTENSION_UNAVAILABLE")
        }
        lesson.accessExtensionSeconds = Math.addExact(lesson.accessExtensionSeconds, 600)
        lesson.accessRevision = Math.incrementExact(lesson.accessRevision)
        lesson.updatedAt = now
        lessonRepo.saveAndFlush(lesson)
        return store.get(authentication, lessonId).also {
            events.publishEvent(LessonChangedEvent(it.copy(canExtend = null)))
        }
    }
}
