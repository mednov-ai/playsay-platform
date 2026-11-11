package com.playsay.gateway.service

import com.playsay.gateway.dto.MaterialAnnotationRequest
import com.playsay.gateway.dto.MaterialAnnotationResponse
import com.playsay.gateway.dto.UnallocatedAnnotationMaterialPage
import com.playsay.gateway.dto.UnallocatedAnnotationSnapshotPage
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.ScheduledMaterialLookupRow
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.utils.requireSubject
import java.time.Clock
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

private typealias AnnotationScheduledMaterialLookup = ScheduledMaterialLookupRow

@Component
@Suppress("LongParameterList")
class ScheduledMaterialAnnotationService(
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonMaterialCatalogService: LessonMaterialCatalogService,
    private val materialAnnotationService: MaterialAnnotationService,
    private val lessonAuthorizationService: ScheduledLessonAuthorizationService,
    private val admissionGuard: LessonAdmissionGuard,
    private val clock: Clock = Clock.systemUTC(),
) {
    @Transactional
    fun getAnnotationForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): MaterialAnnotationResponse {
        lockScheduledLesson(lessonId)
        val context = annotationContext(authentication, lessonId)
        return context.studentUserId?.let { materialAnnotationService.getOrCreateParallel(lessonId, context.materialId, it) }
            ?: materialAnnotationService.getOrCreate(lessonId, context.materialId)
    }

    @Transactional
    fun saveAnnotationForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: MaterialAnnotationRequest,
    ): MaterialAnnotationResponse {
        lockScheduledLesson(lessonId)
        val context = annotationContext(authentication, lessonId)
        return context.studentUserId?.let { materialAnnotationService.saveParallel(lessonId, context.materialId, it, request) }
            ?: materialAnnotationService.save(lessonId, context.materialId, request)
    }

    @Transactional
    fun getParallelStudentAnnotations(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        materialId: UUID,
        studentSubject: String,
    ): MaterialAnnotationResponse? {
        if (!lessonMaterialCatalogService.canManageMaterials(authentication) ||
            !lessonAuthorizationService.canManageLesson(authentication, lessonId) ||
            admissionGuard.isKicked(lessonId, authentication.token.requireSubject())
        ) throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        lockScheduledLesson(lessonId)
        val lookup = scheduledMaterialLookup(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val participant = lessonParticipantRepo.findParticipantRowByLessonIdAndSubject(lessonId, studentSubject.trim())
        if (lookup.workMode != MetaData.LessonWorkModes.PARALLEL || participant?.materialId != materialId) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return materialAnnotationService.getExistingParallel(lessonId, materialId, participant.userId)
    }

    @Transactional(readOnly = true)
    fun getUnallocatedAnnotations(authentication: JwtAuthenticationToken, lessonId: UUID, materialId: UUID): MaterialAnnotationResponse? {
        requireUnallocatedAnnotationAccess(authentication, lessonId, materialId)
        return materialAnnotationService.getUnallocated(lessonId, materialId)
    }

    @Transactional(readOnly = true)
    fun getUnallocatedMaterials(authentication: JwtAuthenticationToken, lessonId: UUID, page: Int): UnallocatedAnnotationMaterialPage {
        requireUnallocatedLessonAccess(authentication, lessonId)
        return materialAnnotationService.unallocatedMaterials(lessonId, page)
    }

    @Transactional(readOnly = true)
    fun getUnallocatedAnnotationSnapshots(authentication: JwtAuthenticationToken, lessonId: UUID, materialId: UUID, page: Int): UnallocatedAnnotationSnapshotPage {
        requireUnallocatedAnnotationAccess(authentication, lessonId, materialId)
        return materialAnnotationService.quarantined(lessonId, materialId, page)
    }

    private fun requireUnallocatedAnnotationAccess(authentication: JwtAuthenticationToken, lessonId: UUID, materialId: UUID) {
        val lookup = requireUnallocatedLessonAccess(authentication, lessonId)
        if (lookup.materialId != materialId && materialId !in lessonParticipantRepo.findAssignedMaterialIdsByLessonId(lessonId) &&
            !materialAnnotationService.hasUnallocated(lessonId, materialId)
        ) throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
    }

    private fun requireUnallocatedLessonAccess(authentication: JwtAuthenticationToken, lessonId: UUID): AnnotationScheduledMaterialLookup {
        if (authentication.authorities.none { it.authority == MetaData.Authorities.TEACHER } ||
            admissionGuard.isKicked(lessonId, authentication.token.requireSubject()) ||
            !lessonAuthorizationService.canManageLesson(authentication, lessonId)
        ) throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        val lookup = scheduledMaterialLookup(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        if (lookup.workMode != MetaData.LessonWorkModes.PARALLEL) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return lookup
    }

    private data class AnnotationContext(val materialId: UUID, val studentUserId: UUID?)

    private fun annotationContext(authentication: JwtAuthenticationToken, lessonId: UUID): AnnotationContext {
        if (admissionGuard.isKicked(lessonId, authentication)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        val lookup = scheduledMaterialLookup(authentication, lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val manager = lessonMaterialCatalogService.canManageMaterials(authentication)
        if (manager && !lessonAuthorizationService.canManageLesson(authentication, lessonId)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        if (lookup.workMode == MetaData.LessonWorkModes.PARALLEL && manager) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        }
        val materialId = materialIdForAccessibleScheduledLesson(authentication, lessonId)
        val studentId = if (lookup.workMode == MetaData.LessonWorkModes.PARALLEL) {
            lessonParticipantRepo.findParticipantRowByLessonIdAndSubject(lessonId, authentication.token.requireSubject())?.userId
                ?: throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
        } else null
        return AnnotationContext(materialId, studentId)
    }

    private fun materialIdForAccessibleScheduledLesson(authentication: JwtAuthenticationToken, lessonId: UUID): UUID {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        return lookup.materialId ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
    }

    private fun accessibleScheduledMaterial(authentication: JwtAuthenticationToken, lessonId: UUID): AnnotationScheduledMaterialLookup {
        val lookup = scheduledMaterialLookup(authentication, lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)

        if (!lessonMaterialCatalogService.canManageMaterials(authentication) && !lookup.isMaterialVisibleToParticipant(clock.instant())) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        if (!lessonMaterialCatalogService.canManageMaterials(authentication) && !isLessonParticipant(lessonId, authentication.token.requireSubject())) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        if (lookup.materialId == null) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return lookup
    }

    private fun scheduledMaterialLookup(lessonId: UUID): AnnotationScheduledMaterialLookup? =
        lessonRepo.findScheduledMaterialLookup(lessonId)

    private fun scheduledMaterialLookup(authentication: JwtAuthenticationToken, lessonId: UUID): AnnotationScheduledMaterialLookup? =
        if (lessonMaterialCatalogService.canManageMaterials(authentication)) {
            lessonRepo.findScheduledMaterialLookup(lessonId)
        } else {
            lessonRepo.findScheduledMaterialLookupForStudent(lessonId, authentication.token.requireSubject())
        }

    private fun lockScheduledLesson(lessonId: UUID) {
        lessonRepo.lockById(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
    }

    private fun isLessonParticipant(lessonId: UUID, subject: String): Boolean =
        lessonParticipantRepo.countByLessonIdAndStudentSubject(lessonId, subject) > 0
}
