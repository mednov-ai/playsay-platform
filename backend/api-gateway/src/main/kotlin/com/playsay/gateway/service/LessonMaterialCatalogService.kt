package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.entity.LessonMaterialEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class LessonMaterialCatalogService(
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val userProfileStore: UserProfileStore,
    private val materialRequestValidator: MaterialRequestValidator,
    private val lessonMaterialResponseMapper: LessonMaterialResponseMapper,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    @Transactional(readOnly = true)
    fun list(authentication: JwtAuthenticationToken): List<LessonMaterialResponse> {
        val materials = when {
            isMaterialAdmin(authentication) -> {
                lessonMaterialRepo.findRowsForAdmin(MetaData.MaterialStatuses.ARCHIVED)
            }
            canManageMaterials(authentication) -> {
                lessonMaterialRepo.findRowsForTeacher(
                    ownerTeacherUserId = userProfileStore.currentUserId(authentication),
                    archivedStatus = MetaData.MaterialStatuses.ARCHIVED,
                    publicVisibility = MetaData.MaterialVisibility.PUBLIC,
                    publishedStatus = MetaData.MaterialStatuses.PUBLISHED,
                )
            }
            else -> {
                lessonMaterialRepo.findPublicPublishedRows(
                    publicVisibility = MetaData.MaterialVisibility.PUBLIC,
                    publishedStatus = MetaData.MaterialStatuses.PUBLISHED,
                )
            }
        }

        return materials.map { material -> lessonMaterialResponseMapper.toResponse(material) }
    }

    @Transactional(readOnly = true)
    fun get(authentication: JwtAuthenticationToken, materialId: UUID): LessonMaterialResponse {
        val currentUserId = currentUserIdIfNeeded(authentication)
        val material = find(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        if (!canRead(material, authentication, currentUserId)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return lessonMaterialResponseMapper.toResponse(material)
    }

    @Transactional
    fun create(authentication: JwtAuthenticationToken, request: LessonMaterialRequest): LessonMaterialResponse {
        requireMaterialManager(authentication)
        val ownerTeacherUserId = userProfileStore.currentUserId(authentication)
        val values = materialRequestValidator.validate(request)
        val now = Instant.now()

        val material = lessonMaterialRepo.save(
            LessonMaterialEntity(
                id = UUID.randomUUID(),
                ownerTeacherUserId = ownerTeacherUserId,
                title = values.title,
                description = values.description,
                language = values.language,
                cefrLevel = values.cefrLevel,
                visibility = values.visibility,
                status = values.status,
                document = objectMapper.writeValueAsString(values.document),
                sourceMeta = objectMapper.writeValueAsString(values.sourceMeta),
                scoringRubric = objectMapper.writeValueAsString(values.scoringRubric),
                createdAt = now,
                updatedAt = now,
            ),
        )

        return lessonMaterialResponseMapper.toResponse(requireExisting(material.id))
    }

    @Transactional
    fun update(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: LessonMaterialRequest,
    ): LessonMaterialResponse {
        requireEditable(authentication, materialId, MetaData.ErrorCodes.MATERIAL_EDIT_FORBIDDEN)
        val values = materialRequestValidator.validate(request)
        val entity = lessonMaterialRepo.findById(materialId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        entity.title = values.title
        entity.description = values.description
        entity.language = values.language
        entity.cefrLevel = values.cefrLevel
        entity.visibility = values.visibility
        entity.status = values.status
        entity.document = objectMapper.writeValueAsString(values.document)
        entity.sourceMeta = objectMapper.writeValueAsString(values.sourceMeta)
        entity.scoringRubric = objectMapper.writeValueAsString(values.scoringRubric)
        entity.updatedAt = Instant.now()
        lessonMaterialRepo.save(entity)

        return lessonMaterialResponseMapper.toResponse(requireExisting(materialId))
    }

    @Transactional
    fun archive(authentication: JwtAuthenticationToken, materialId: UUID) {
        requireEditable(authentication, materialId, MetaData.ErrorCodes.MATERIAL_ARCHIVE_FORBIDDEN)
        val entity = lessonMaterialRepo.findById(materialId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        entity.status = MetaData.MaterialStatuses.ARCHIVED
        entity.updatedAt = Instant.now()
        lessonMaterialRepo.save(entity)
    }

    @Transactional(readOnly = true)
    fun find(materialId: UUID): LessonMaterialRow? =
        lessonMaterialRepo.findRowById(materialId)

    fun toResponse(material: LessonMaterialRow): LessonMaterialResponse =
        lessonMaterialResponseMapper.toResponse(material)

    @Transactional(readOnly = true)
    fun requireActive(materialId: UUID): LessonMaterialRow =
        requireExisting(materialId).takeIf { material -> material.status != MetaData.MaterialStatuses.ARCHIVED }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)

    @Transactional(readOnly = true)
    fun requireEditable(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        forbiddenErrorCode: String,
    ): LessonMaterialRow {
        val material = requireExisting(materialId)
        val currentUserId = currentUserIdIfNeeded(authentication)
        if (!canEdit(material, authentication, currentUserId)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, forbiddenErrorCode)
        }
        return material
    }

    fun requireMaterialManager(authentication: JwtAuthenticationToken) {
        if (!canManageMaterials(authentication)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
        }
    }

    fun currentUserIdIfNeeded(authentication: JwtAuthenticationToken): UUID? =
        if (canManageMaterials(authentication)) userProfileStore.currentUserId(authentication) else null

    fun currentUserId(authentication: JwtAuthenticationToken): UUID =
        userProfileStore.currentUserId(authentication)

    fun canRead(material: LessonMaterialRow, authentication: JwtAuthenticationToken, currentUserId: UUID?): Boolean {
        if (isMaterialAdmin(authentication)) {
            return true
        }
        if (canManageMaterials(authentication) && material.ownerTeacherUserId == currentUserId) {
            return true
        }
        return material.visibility == MetaData.MaterialVisibility.PUBLIC &&
            material.status == MetaData.MaterialStatuses.PUBLISHED
    }

    fun canManageMaterials(authentication: JwtAuthenticationToken): Boolean =
        authentication.authorities.any { authority ->
            authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN
        }

    private fun requireExisting(materialId: UUID): LessonMaterialRow =
        find(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)

    private fun canEdit(material: LessonMaterialRow, authentication: JwtAuthenticationToken, currentUserId: UUID?): Boolean =
        isMaterialAdmin(authentication) || (canManageMaterials(authentication) && material.ownerTeacherUserId == currentUserId)

    private fun isMaterialAdmin(authentication: JwtAuthenticationToken): Boolean =
        authentication.authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }
}
