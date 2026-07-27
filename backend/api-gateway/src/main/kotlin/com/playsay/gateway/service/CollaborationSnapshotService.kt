package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.CollaborationDocumentResponse
import com.playsay.gateway.dto.FinalizeCollaborationDocumentRequest
import com.playsay.gateway.dto.MaterialSubmissionResponse
import com.playsay.gateway.dto.SaveCollaborationSnapshotRequest
import com.playsay.gateway.entity.CollaborationDocumentEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.CollaborationDocumentRepo
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class CollaborationSnapshotService(
    private val collaborationDocumentRepo: CollaborationDocumentRepo,
    private val collaborationDocumentService: CollaborationDocumentService,
    private val lessonMaterialStore: LessonMaterialStore,
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.collaboration.service-token:}") private val collaborationServiceToken: String,
) {
    @Transactional
    fun saveSnapshot(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        documentId: UUID,
        request: SaveCollaborationSnapshotRequest,
    ): CollaborationDocumentResponse {
        collaborationDocumentService.requireDocumentAccess(authentication, lessonId, documentId)
        return saveSnapshot(lockedDocument(lessonId, documentId), request)
    }

    @Transactional
    fun saveSnapshotFromService(
        serviceToken: String?,
        lessonId: UUID,
        documentId: UUID,
        request: SaveCollaborationSnapshotRequest,
    ): CollaborationDocumentResponse {
        requireValidServiceToken(serviceToken)
        return saveSnapshot(lockedDocument(lessonId, documentId), request)
    }

    @Transactional(readOnly = true)
    fun getSnapshotFromService(
        serviceToken: String?,
        lessonId: UUID,
        documentId: UUID,
    ): CollaborationDocumentResponse {
        requireValidServiceToken(serviceToken)
        val document = collaborationDocumentRepo.findById(documentId).orElse(null)
            ?.takeIf { found -> found.lessonId == lessonId }
            ?: documentNotFound()
        return collaborationDocumentService.response(document)
    }

    @Transactional
    fun finalize(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        documentId: UUID,
        request: FinalizeCollaborationDocumentRequest,
    ): MaterialSubmissionResponse {
        collaborationDocumentService.requireDocumentAccess(authentication, lessonId, documentId)
        val document = lockedDocument(lessonId, documentId)
        if (document.collaborationScope != MetaData.CollaborationScopes.INDIVIDUAL || document.studentUserId == null) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SCOPE_INVALID)
        }
        val snapshot = document.snapshotJson
            ?.let { value -> runCatching { objectMapper.readTree(value) }.getOrNull() }
            ?: throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.COLLABORATION_SNAPSHOT_INVALID,
            )
        validateSnapshot(snapshot)
        return lessonMaterialStore.saveCollaborationSubmission(
            lessonId = lessonId,
            materialId = document.materialId,
            studentUserId = requireNotNull(document.studentUserId),
            yjsDocumentId = document.yjsDocumentId,
            content = snapshot,
            submitted = request.submitted,
        )
    }

    private fun saveSnapshot(
        document: CollaborationDocumentEntity,
        request: SaveCollaborationSnapshotRequest,
    ): CollaborationDocumentResponse {
        persistSnapshot(document, request.snapshot, request.snapshotStorageKey)
        return collaborationDocumentService.response(document)
    }

    private fun persistSnapshot(
        document: CollaborationDocumentEntity,
        snapshot: JsonNode,
        storageKey: String?,
    ) {
        validateSnapshot(snapshot)
        document.snapshotJson = objectMapper.writeValueAsString(snapshot)
        document.snapshotStorageKey = storageKey?.trim()?.takeIf { key -> key.isNotEmpty() }
        document.version += 1
        document.updatedAt = Instant.now()
        collaborationDocumentRepo.save(document)
    }

    private fun lockedDocument(lessonId: UUID, documentId: UUID): CollaborationDocumentEntity =
        collaborationDocumentRepo.findByIdForUpdate(documentId)
            ?.takeIf { found -> found.lessonId == lessonId }
            ?: documentNotFound()

    private fun validateSnapshot(snapshot: JsonNode) {
        if (objectMapper.writeValueAsBytes(snapshot).size > 1_000_000) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.COLLABORATION_SNAPSHOT_INVALID,
            )
        }
    }

    private fun requireValidServiceToken(serviceToken: String?) {
        val expected = collaborationServiceToken.trim()
        if (expected.length < 32) {
            throw ProjectResponseException.localized(
                HttpStatus.SERVICE_UNAVAILABLE,
                MetaData.ErrorCodes.COLLABORATION_NOT_CONFIGURED,
            )
        }
        if (serviceToken?.trim() != expected) {
            throw ProjectResponseException.localized(
                HttpStatus.FORBIDDEN,
                MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED,
            )
        }
    }

    private fun documentNotFound(): Nothing =
        throw ProjectResponseException.localized(
            HttpStatus.NOT_FOUND,
            MetaData.ErrorCodes.COLLABORATION_DOCUMENT_NOT_FOUND,
        )
}
