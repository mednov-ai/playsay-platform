package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.playsay.gateway.dto.LessonMaterialDraftResponse
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialAiDraftRequest
import com.playsay.gateway.dto.MaterialAnnotationRequest
import com.playsay.gateway.dto.MaterialAnnotationResponse
import com.playsay.gateway.dto.MaterialAnswerSuggestionsRequest
import com.playsay.gateway.dto.MaterialAnswerSuggestionsResponse
import com.playsay.gateway.dto.MaterialAssetResponse
import com.playsay.gateway.dto.MaterialAssetUpdateRequest
import com.playsay.gateway.dto.MaterialHtmlGameEnrichmentRequest
import com.playsay.gateway.dto.MaterialHtmlGameEnrichmentResponse
import com.playsay.gateway.dto.MaterialGameAdaptationRequest
import com.playsay.gateway.dto.MaterialGameAdaptationResponse
import com.playsay.gateway.dto.MaterialGenerateImagesRequest
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.MaterialSubmissionResponse
import com.playsay.gateway.dto.MaterialUrlImportRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.repo.ScheduledMaterialLookupRow
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile

private typealias StoredLessonMaterial = LessonMaterialRow
private typealias ScheduledMaterialLookup = ScheduledMaterialLookupRow

@Component
class LessonMaterialStore(
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonMaterialCatalogService: LessonMaterialCatalogService,
    private val lessonMaterialAuthoringService: LessonMaterialAuthoringService,
    private val materialAssetService: MaterialAssetService,
    private val materialReadAccessPolicy: MaterialReadAccessPolicy,
    private val materialHtmlGameEnrichmentService: MaterialHtmlGameEnrichmentService,
    private val materialGameAdaptationService: MaterialGameAdaptationService,
    private val materialSubmissionService: MaterialSubmissionService,
    private val materialAnnotationService: MaterialAnnotationService,
) {
    @Transactional
    fun list(authentication: JwtAuthenticationToken): List<LessonMaterialResponse> =
        lessonMaterialCatalogService.list(authentication)

    @Transactional
    fun get(authentication: JwtAuthenticationToken, materialId: UUID): LessonMaterialResponse =
        lessonMaterialCatalogService.get(authentication, materialId)

    @Transactional
    fun create(authentication: JwtAuthenticationToken, request: LessonMaterialRequest): LessonMaterialResponse =
        lessonMaterialCatalogService.create(authentication, request)

    @Transactional
    fun update(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: LessonMaterialRequest,
    ): LessonMaterialResponse =
        lessonMaterialCatalogService.update(authentication, materialId, request)

    @Transactional
    fun archive(authentication: JwtAuthenticationToken, materialId: UUID) =
        lessonMaterialCatalogService.archive(authentication, materialId)

    @Transactional(readOnly = true)
    fun getForScheduledLesson(authentication: JwtAuthenticationToken, lessonId: UUID): LessonMaterialResponse =
        lessonMaterialCatalogService.toResponse(materialForAccessibleScheduledLesson(authentication, lessonId))

    @Transactional
    fun getSubmissionForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): MaterialSubmissionResponse {
        val material = materialForAccessibleScheduledLesson(authentication, lessonId)
        val userId = lessonMaterialCatalogService.currentUserId(authentication)
        return materialSubmissionService.getOrCreateForScheduledLesson(lessonId, material, userId)
    }

    @Transactional(readOnly = true)
    fun listSubmissionsForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): List<MaterialSubmissionResponse> {
        lessonMaterialCatalogService.requireMaterialManager(authentication)
        val lookup = scheduledMaterialLookup(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val materialIds = if (lookup.workMode == MetaData.LessonWorkModes.PARALLEL) {
            lessonParticipantRepo.findAssignedMaterialIdsByLessonId(lessonId)
        } else {
            listOfNotNull(lookup.materialId)
        }
        if (materialIds.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return materialSubmissionService.listForScheduledLesson(lessonId, materialIds)
    }

    @Transactional
    fun saveSubmissionForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: MaterialSubmissionRequest,
    ): MaterialSubmissionResponse {
        val targetStudentSubject = request.targetStudentSubject?.trim()?.takeIf { subject -> subject.isNotEmpty() }
        if (targetStudentSubject != null) {
            lessonMaterialCatalogService.requireMaterialManager(authentication)
            val lookup = lessonRepo.findScheduledMaterialLookupForStudent(lessonId, targetStudentSubject)
                ?: throw ProjectResponseException.localized(
                    HttpStatus.NOT_FOUND,
                    MetaData.ErrorCodes.UNKNOWN_PARTICIPANT_SUBJECT,
                    targetStudentSubject,
                )
            val materialId = lookup.materialId
                ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
            val participant = lessonParticipantRepo.findParticipantRowByLessonIdAndSubject(lessonId, targetStudentSubject)
                ?: throw ProjectResponseException.localized(
                    HttpStatus.NOT_FOUND,
                    MetaData.ErrorCodes.UNKNOWN_PARTICIPANT_SUBJECT,
                    targetStudentSubject,
                )
            return materialSubmissionService.saveForScheduledLesson(
                lessonId = lessonId,
                material = lessonMaterialCatalogService.requireActive(materialId),
                userId = participant.userId,
                request = request,
            )
        }

        val material = materialForAccessibleScheduledLesson(authentication, lessonId)
        val userId = lessonMaterialCatalogService.currentUserId(authentication)
        return materialSubmissionService.saveForScheduledLesson(lessonId, material, userId, request)
    }

    @Transactional
    fun saveCollaborationSubmission(
        lessonId: UUID,
        materialId: UUID,
        studentUserId: UUID,
        yjsDocumentId: String,
        content: JsonNode,
        submitted: Boolean,
    ): MaterialSubmissionResponse =
        materialSubmissionService.saveCollaborationSubmission(
            lessonId = lessonId,
            material = lessonMaterialCatalogService.requireActive(materialId),
            studentUserId = studentUserId,
            yjsDocumentId = yjsDocumentId,
            content = content,
            submitted = submitted,
        )

    @Transactional
    fun getAnnotationForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): MaterialAnnotationResponse {
        val materialId = materialIdForAccessibleScheduledLesson(authentication, lessonId)
        lockScheduledLesson(lessonId)
        return materialAnnotationService.getOrCreate(lessonId, materialId)
    }

    @Transactional
    fun saveAnnotationForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: MaterialAnnotationRequest,
    ): MaterialAnnotationResponse {
        val materialId = materialIdForAccessibleScheduledLesson(authentication, lessonId)
        lockScheduledLesson(lessonId)
        return materialAnnotationService.save(lessonId, materialId, request)
    }

    fun draft(authentication: JwtAuthenticationToken, request: MaterialAiDraftRequest): LessonMaterialDraftResponse {
        lessonMaterialCatalogService.requireMaterialManager(authentication)
        return lessonMaterialAuthoringService.draft(request)
    }

    fun draftFromUrl(authentication: JwtAuthenticationToken, request: MaterialUrlImportRequest): LessonMaterialDraftResponse {
        lessonMaterialCatalogService.requireMaterialManager(authentication)
        return lessonMaterialAuthoringService.draftFromUrl(request)
    }

    @Transactional
    fun generateImages(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: MaterialGenerateImagesRequest,
    ): LessonMaterialResponse {
        val material = lessonMaterialCatalogService.requireEditable(
            authentication,
            materialId,
            MetaData.ErrorCodes.MATERIAL_IMAGES_FORBIDDEN,
        )
        return lessonMaterialAuthoringService.generateImages(material, request)
    }

    @Transactional
    fun suggestAcceptedAnswers(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: MaterialAnswerSuggestionsRequest,
    ): MaterialAnswerSuggestionsResponse {
        val material = lessonMaterialCatalogService.requireEditable(
            authentication,
            materialId,
            MetaData.ErrorCodes.MATERIAL_ANSWER_SUGGESTIONS_FORBIDDEN,
        )
        return lessonMaterialAuthoringService.suggestAcceptedAnswers(material, request)
    }

    @Transactional
    fun listAssets(authentication: JwtAuthenticationToken, materialId: UUID): List<MaterialAssetResponse> {
        materialReadAccessPolicy.requireReadable(authentication, materialId)
        return materialAssetService.list(materialId)
    }

    @Transactional
    fun assetContent(authentication: JwtAuthenticationToken, materialId: UUID, assetId: UUID): ResponseEntity<ByteArray> {
        materialReadAccessPolicy.requireReadable(authentication, materialId)
        return materialAssetService.content(materialId, assetId)
    }

    @Transactional
    fun updateAsset(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        assetId: UUID,
        request: MaterialAssetUpdateRequest,
    ): MaterialAssetResponse {
        lessonMaterialCatalogService.requireEditable(
            authentication,
            materialId,
            MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN,
        )
        return materialAssetService.update(materialId, assetId, request)
    }

    @Transactional
    fun uploadImageAsset(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        file: MultipartFile,
    ): MaterialAssetResponse {
        lessonMaterialCatalogService.requireEditable(
            authentication,
            materialId,
            MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN,
        )
        return materialAssetService.uploadImageAsset(materialId, file)
    }

    @Transactional
    fun uploadHtmlGameAsset(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        file: MultipartFile,
    ): MaterialAssetResponse {
        lessonMaterialCatalogService.requireEditable(
            authentication,
            materialId,
            MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN,
        )
        return materialAssetService.uploadHtmlGameAsset(materialId, file)
    }

    @Transactional
    fun requestHtmlGameEnrichment(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        assetId: UUID,
        request: MaterialHtmlGameEnrichmentRequest,
    ): MaterialHtmlGameEnrichmentResponse {
        lessonMaterialCatalogService.requireEditable(authentication, materialId, MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN)
        return materialHtmlGameEnrichmentService.request(materialId, assetId, request)
    }

    @Transactional(readOnly = true)
    fun htmlGameEnrichmentStatus(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        assetId: UUID,
        blockId: String,
    ): MaterialHtmlGameEnrichmentResponse {
        materialReadAccessPolicy.requireReadable(authentication, materialId)
        return materialHtmlGameEnrichmentService.status(materialId, assetId, blockId)
    }

    @Transactional
    fun requestGameAdaptation(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        assetId: UUID,
        request: MaterialGameAdaptationRequest,
    ): MaterialGameAdaptationResponse {
        lessonMaterialCatalogService.requireEditable(authentication, materialId, MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN)
        return materialGameAdaptationService.request(materialId, assetId, request)
    }

    @Transactional(readOnly = true)
    fun gameAdaptationStatus(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        assetId: UUID,
        jobId: UUID,
    ): MaterialGameAdaptationResponse {
        lessonMaterialCatalogService.requireEditable(authentication, materialId, MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN)
        return materialGameAdaptationService.status(materialId, assetId, jobId)
    }

    @Transactional
    fun applyGameAdaptation(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        assetId: UUID,
        jobId: UUID,
    ): MaterialGameAdaptationResponse {
        lessonMaterialCatalogService.requireEditable(authentication, materialId, MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN)
        return materialGameAdaptationService.apply(materialId, assetId, jobId)
    }

    @Transactional
    fun revalidateGameAdaptation(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        assetId: UUID,
        jobId: UUID,
    ): MaterialGameAdaptationResponse {
        lessonMaterialCatalogService.requireEditable(authentication, materialId, MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN)
        return materialGameAdaptationService.revalidate(materialId, assetId, jobId)
    }

    @Transactional
    fun rollbackGameAdaptation(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        assetId: UUID,
        jobId: UUID,
    ): MaterialGameAdaptationResponse {
        lessonMaterialCatalogService.requireEditable(authentication, materialId, MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN)
        return materialGameAdaptationService.rollback(materialId, assetId, jobId)
    }

    private fun materialForAccessibleScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): StoredLessonMaterial =
        lessonMaterialCatalogService.requireActive(materialIdForAccessibleScheduledLesson(authentication, lessonId))

    private fun materialIdForAccessibleScheduledLesson(authentication: JwtAuthenticationToken, lessonId: UUID): UUID {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        return lookup.materialId ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
    }

    private fun accessibleScheduledMaterial(authentication: JwtAuthenticationToken, lessonId: UUID): ScheduledMaterialLookup {
        val lookup = scheduledMaterialLookup(authentication, lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)

        if (!lessonMaterialCatalogService.canManageMaterials(authentication) && !lookup.isVisibleToParticipant(Instant.now())) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        if (!lessonMaterialCatalogService.canManageMaterials(authentication) && !isLessonParticipant(lessonId, authentication.token.subject)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        if (lookup.materialId == null) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return lookup
    }

    private fun scheduledMaterialLookup(lessonId: UUID): ScheduledMaterialLookup? =
        lessonRepo.findScheduledMaterialLookup(lessonId)

    private fun scheduledMaterialLookup(authentication: JwtAuthenticationToken, lessonId: UUID): ScheduledMaterialLookup? =
        if (lessonMaterialCatalogService.canManageMaterials(authentication)) {
            lessonRepo.findScheduledMaterialLookup(lessonId)
        } else {
            lessonRepo.findScheduledMaterialLookupForStudent(lessonId, authentication.token.subject)
        }

    private fun lockScheduledLesson(lessonId: UUID) {
        lessonRepo.lockById(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
    }

    private fun isLessonParticipant(lessonId: UUID, subject: String): Boolean =
        lessonParticipantRepo.countByLessonIdAndStudentSubject(lessonId, subject) > 0
}

private fun ScheduledMaterialLookup.isVisibleToParticipant(now: Instant): Boolean =
    isLessonInsideAccessWindow(
        status = status,
        scheduledStart = scheduledStart,
        scheduledEnd = scheduledEnd,
        now = now,
        closedStatuses = expiredMaterialParticipantStatuses,
    )

private val expiredMaterialParticipantStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
