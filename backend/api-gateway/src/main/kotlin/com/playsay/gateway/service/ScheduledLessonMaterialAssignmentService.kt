package com.playsay.gateway.service

import com.playsay.gateway.dto.ScheduledLessonResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.realtime.LessonChangedEvent
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class ScheduledLessonMaterialAssignmentService(
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val appUserRepo: AppUserRepo,
    private val userProfileStore: UserProfileStore,
    private val authorizationService: ScheduledLessonAuthorizationService,
    private val eventPublisher: ApplicationEventPublisher,
) {
    @Transactional
    fun assignShared(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        materialId: UUID,
    ): ScheduledLessonResponse {
        authentication.requireScheduleManager()
        requireLessonManagement(authentication, lessonId)
        validateMaterialId(authentication, materialId)
        val lesson = lessonRepo.lockById(lessonId)
            ?: throw notFound()
        if (lesson.workMode == MetaData.LessonWorkModes.PARALLEL) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_IMAGE_PAGE_PARALLEL_UNSUPPORTED,
            )
        }
        lesson.materialId = materialId
        lesson.inheritTemplateMaterial = false
        lesson.updatedAt = Instant.now()
        lessonRepo.saveAndFlush(lesson)
        return publishUpdated(lessonId)
    }

    @Transactional
    fun assignParticipant(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        participantSubject: String,
        materialId: UUID,
    ): ScheduledLessonResponse {
        authentication.requireScheduleManager()
        requireLessonManagement(authentication, lessonId)
        validateMaterialId(authentication, materialId)
        val lesson = lessonRepo.lockById(lessonId)
            ?: throw notFound()
        if (lesson.workMode != MetaData.LessonWorkModes.PARALLEL) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID)
        }
        val participant = lessonParticipantRepo.findByLessonId(lessonId).firstOrNull { item ->
            appUserRepo.findById(item.studentUserId).orElse(null)?.keycloakSubject == participantSubject
        } ?: throw notFound()
        participant.materialId = materialId
        lessonParticipantRepo.saveAndFlush(participant)
        lesson.updatedAt = Instant.now()
        lessonRepo.saveAndFlush(lesson)
        return publishUpdated(lessonId)
    }

    private fun publishUpdated(lessonId: UUID): ScheduledLessonResponse {
        val lesson = lessonRepo.findScheduleRowById(lessonId) ?: throw notFound()
        val participants = lessonParticipantRepo.findParticipantRowsByLessonIds(listOf(lessonId))
        val updated = lesson.toResponse(participants)
        eventPublisher.publishEvent(LessonChangedEvent(updated))
        return updated
    }

    private fun requireLessonManagement(authentication: JwtAuthenticationToken, lessonId: UUID) {
        if (!authorizationService.canManageLesson(authentication, lessonId)) throw notFound()
    }

    private fun validateMaterialId(authentication: JwtAuthenticationToken, materialId: UUID) {
        val exists = if (authentication.isScheduleAdmin()) {
            lessonMaterialRepo.existsByIdAndStatusNot(materialId, MetaData.MaterialStatuses.ARCHIVED)
        } else {
            lessonMaterialRepo.countVisibleActiveForUser(
                materialId = materialId,
                currentUserId = userProfileStore.currentUserId(authentication),
                archivedStatus = MetaData.MaterialStatuses.ARCHIVED,
                publicVisibility = MetaData.MaterialVisibility.PUBLIC,
                publishedStatus = MetaData.MaterialStatuses.PUBLISHED,
            ) > 0
        }
        if (!exists) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.MATERIAL_ID_NOT_FOUND)
        }
    }

    private fun notFound(): ProjectResponseException =
        ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
}
