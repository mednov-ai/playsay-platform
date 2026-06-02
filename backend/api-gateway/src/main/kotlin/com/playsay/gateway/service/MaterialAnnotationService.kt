package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialAnnotationRequest
import com.playsay.gateway.dto.MaterialAnnotationResponse
import com.playsay.gateway.entity.LessonMaterialAnnotationEntity
import com.playsay.gateway.repo.LessonMaterialAnnotationRepo
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Component

private typealias StoredMaterialAnnotation = LessonMaterialAnnotationEntity

@Component
class MaterialAnnotationService(
    private val lessonMaterialAnnotationRepo: LessonMaterialAnnotationRepo,
    private val materialRequestValidator: MaterialRequestValidator,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    fun getOrCreate(lessonId: UUID, materialId: UUID): MaterialAnnotationResponse {
        val annotation = findMaterialAnnotation(lessonId, materialId)
            ?: createEmptyMaterialAnnotation(lessonId, materialId)
        return annotation.toResponse(objectMapper)
    }

    fun save(lessonId: UUID, materialId: UUID, request: MaterialAnnotationRequest): MaterialAnnotationResponse {
        materialRequestValidator.validateJsonSize("content", request.content, 1_000_000)

        val existing = findMaterialAnnotation(lessonId, materialId)
        val now = Instant.now()
        val content = objectMapper.writeValueAsString(request.content)
        val annotationId = if (existing == null) {
            lessonMaterialAnnotationRepo.saveAndFlush(
                LessonMaterialAnnotationEntity(
                    id = UUID.randomUUID(),
                    lessonId = lessonId,
                    materialId = materialId,
                    content = content,
                    createdAt = now,
                    updatedAt = now,
                ),
            ).id
        } else {
            val entity = lessonMaterialAnnotationRepo.findById(existing.id).orElseThrow()
            entity.content = content
            entity.updatedAt = now
            lessonMaterialAnnotationRepo.save(entity)
            existing.id
        }

        return requireNotNull(findMaterialAnnotation(annotationId)).toResponse(objectMapper)
    }

    private fun createEmptyMaterialAnnotation(lessonId: UUID, materialId: UUID): StoredMaterialAnnotation {
        val now = Instant.now()
        val annotation = lessonMaterialAnnotationRepo.saveAndFlush(
            LessonMaterialAnnotationEntity(
                id = UUID.randomUUID(),
                lessonId = lessonId,
                materialId = materialId,
                content = emptyMaterialAnnotationContent(),
                createdAt = now,
                updatedAt = now,
            ),
        )
        return requireNotNull(findMaterialAnnotation(annotation.id))
    }

    private fun emptyMaterialAnnotationContent(): String {
        val root = objectMapper.createObjectNode()
        root.put("schemaVersion", 1)
        root.set<ArrayNode>("strokes", objectMapper.createArrayNode())
        return objectMapper.writeValueAsString(root)
    }

    private fun findMaterialAnnotation(lessonId: UUID, materialId: UUID): StoredMaterialAnnotation? =
        lessonMaterialAnnotationRepo.findByLessonIdAndMaterialId(lessonId, materialId)

    private fun findMaterialAnnotation(annotationId: UUID): StoredMaterialAnnotation? =
        lessonMaterialAnnotationRepo.findById(annotationId).orElse(null)
}

private fun StoredMaterialAnnotation.toResponse(objectMapper: ObjectMapper): MaterialAnnotationResponse =
    MaterialAnnotationResponse(
        id = id,
        lessonId = lessonId,
        materialId = materialId,
        content = objectMapper.readTree(content),
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
