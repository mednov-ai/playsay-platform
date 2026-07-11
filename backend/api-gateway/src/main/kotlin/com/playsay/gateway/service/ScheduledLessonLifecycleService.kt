package com.playsay.gateway.service

import com.playsay.gateway.dto.ScheduledLessonResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.realtime.LessonChangedEvent
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ScheduledLessonLifecycleService(
    private val lessonRepo: LessonRepo,
    private val lessonReminderService: LessonReminderService,
    private val scheduledLessonStore: ScheduledLessonStore,
    private val eventPublisher: ApplicationEventPublisher,
) {
    @Transactional
    fun start(authentication: JwtAuthenticationToken, lessonId: UUID): ScheduledLessonResponse {
        authentication.requireLessonManager()
        val lesson = lessonRepo.lockById(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)

        if (lesson.status in closedLessonStatuses) {
            throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.SCHEDULED_LESSON_CANNOT_START)
        }

        if (lesson.status != MetaData.LessonStatuses.IN_PROGRESS) {
            val now = Instant.now()
            lesson.status = MetaData.LessonStatuses.IN_PROGRESS
            lesson.actualStart = lesson.actualStart ?: now
            lesson.updatedAt = now
            lessonRepo.saveAndFlush(lesson)
            lessonReminderService.cancelPendingReminders(lessonId)
        }

        return scheduledLessonStore.get(authentication, lessonId).also { started ->
            eventPublisher.publishEvent(LessonChangedEvent(started))
        }
    }
}

private fun JwtAuthenticationToken.requireLessonManager() {
    val canManage = authorities.any { authority ->
        authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN
    }
    if (!canManage) {
        throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
    }
}

private val closedLessonStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
