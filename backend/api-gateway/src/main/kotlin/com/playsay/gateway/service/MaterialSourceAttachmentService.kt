package com.playsay.gateway.service

import com.playsay.gateway.dto.WorksheetSourceAttachmentResponse
import com.playsay.gateway.entity.MaterialSourceAttachmentEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.MaterialSourceAttachmentRepository
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class MaterialSourceAttachmentContent(
    val bytes: ByteArray,
    val mimeType: String,
    val fileName: String,
)

@Service
class MaterialSourceAttachmentService(
    private val attachments: MaterialSourceAttachmentRepository,
    private val materials: LessonMaterialRepo,
    private val storage: MaterialObjectStorage,
) {
    @Transactional(readOnly = true)
    fun listAuthorized(authentication: JwtAuthenticationToken, materialId: UUID): List<WorksheetSourceAttachmentResponse> {
        authorizeOrNotFound(authentication, materialId)
        return attachments.findAllByMaterialIdOrderByCreatedAtAsc(materialId).map { it.response() }
    }

    @Transactional(readOnly = true)
    fun contentAuthorized(authentication: JwtAuthenticationToken, materialId: UUID, attachmentId: UUID): MaterialSourceAttachmentContent {
        authorizeOrNotFound(authentication, materialId)
        val attachment = attachments.findByIdAndMaterialId(attachmentId, materialId) ?: notFound()
        val content = try { storage.getObject(attachment.storageKey) } catch (_: MaterialObjectNotFoundException) { notFound() }
        return MaterialSourceAttachmentContent(content.bytes, attachment.mimeType, attachment.fileName)
    }

    private fun authorizeOrNotFound(authentication: JwtAuthenticationToken, materialId: UUID) {
        val row = materials.findRowById(materialId) ?: notFound()
        val admin = authentication.authorities.any { it.authority == MetaData.Authorities.ADMIN }
        val teacherOwner = authentication.authorities.any { it.authority == MetaData.Authorities.TEACHER } &&
            row.ownerTeacherSubject == authentication.token.subject
        if (!admin && !teacherOwner) notFound()
    }

    private fun MaterialSourceAttachmentEntity.response() = WorksheetSourceAttachmentResponse(
        id, sourceId, pageId, sourcePageNumber, kind, fileName, mimeType, byteSize,
    )

    private fun notFound(): Nothing = throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
}
