package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialAnnotationRequest
import com.playsay.gateway.dto.MaterialAnnotationResponse
import com.playsay.gateway.dto.UnallocatedAnnotationSnapshotPage
import com.playsay.gateway.dto.UnallocatedAnnotationMaterialPage
import com.playsay.gateway.entity.LessonMaterialAnnotationEntity
import com.playsay.gateway.entity.LessonMaterialParallelAnnotationEntity
import com.playsay.gateway.entity.LessonMaterialParallelAnnotationSnapshotEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialAnnotationRepo
import com.playsay.gateway.repo.LessonMaterialParallelAnnotationRepo
import com.playsay.gateway.repo.LessonMaterialParallelAnnotationSnapshotRepo
import com.playsay.gateway.utils.MetaData
import java.security.MessageDigest
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.HexFormat
import java.util.UUID
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

private typealias StoredMaterialAnnotation = LessonMaterialAnnotationEntity

@Component
class MaterialAnnotationService(
    private val lessonMaterialAnnotationRepo: LessonMaterialAnnotationRepo,
    private val parallelAnnotations: LessonMaterialParallelAnnotationRepo,
    private val parallelSnapshots: LessonMaterialParallelAnnotationSnapshotRepo,
    private val materialRequestValidator: MaterialRequestValidator,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    fun getUnallocated(lessonId: UUID, materialId: UUID): MaterialAnnotationResponse? =
        findMaterialAnnotation(lessonId, materialId)?.toResponse(objectMapper)

    fun hasUnallocated(lessonId: UUID, materialId: UUID): Boolean =
        findMaterialAnnotation(lessonId, materialId) != null || parallelSnapshots.existsByLessonIdAndMaterialId(lessonId, materialId)

    fun unallocatedMaterials(lessonId: UUID, page: Int): UnallocatedAnnotationMaterialPage {
        if (page !in 0..100_000) throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_REQUEST)
        val slice = lessonMaterialAnnotationRepo.findUnallocatedMaterialIds(lessonId, PageRequest.of(page, 10))
        return UnallocatedAnnotationMaterialPage(slice.content, slice.hasNext())
    }

    fun quarantined(lessonId: UUID, materialId: UUID, page: Int): UnallocatedAnnotationSnapshotPage {
        if (page !in 0..100_000) throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_REQUEST)
        val slice = parallelSnapshots.findByLessonIdAndMaterialIdOrderByCreatedAtAscIdAsc(lessonId, materialId, PageRequest.of(page, 5))
        return UnallocatedAnnotationSnapshotPage(slice.content.map { entity ->
            MaterialAnnotationResponse(entity.id, entity.lessonId, entity.materialId, objectMapper.readTree(entity.content), entity.createdAt, entity.createdAt)
        }, slice.hasNext())
    }

    fun getOrCreateParallel(lessonId: UUID, materialId: UUID, studentUserId: UUID): MaterialAnnotationResponse {
        val existing = parallelAnnotations.findByLessonIdAndMaterialIdAndStudentUserId(lessonId, materialId, studentUserId)
        if (existing != null) {
            sanitizeStoredParallel(lessonId, materialId, existing)
            return existing.toResponse(objectMapper)
        }
        val now = Instant.now()
        return parallelAnnotations.saveAndFlush(LessonMaterialParallelAnnotationEntity(
            lessonId = lessonId, materialId = materialId, studentUserId = studentUserId,
            content = emptyMaterialAnnotationContent(), createdAt = now, updatedAt = now,
        )).toResponse(objectMapper)
    }

    fun getExistingParallel(lessonId: UUID, materialId: UUID, studentUserId: UUID): MaterialAnnotationResponse? {
        val entity = parallelAnnotations.findByLessonIdAndMaterialIdAndStudentUserId(lessonId, materialId, studentUserId) ?: return null
        sanitizeStoredParallel(lessonId, materialId, entity)
        return entity.toResponse(objectMapper)
    }

    fun saveParallel(lessonId: UUID, materialId: UUID, studentUserId: UUID, request: MaterialAnnotationRequest): MaterialAnnotationResponse {
        materialRequestValidator.validateJsonSize("content", request.content, 1_000_000)
        val now = Instant.now()
        val entity = parallelAnnotations.findByLessonIdAndMaterialIdAndStudentUserId(lessonId, materialId, studentUserId)
            ?: LessonMaterialParallelAnnotationEntity(lessonId = lessonId, materialId = materialId, studentUserId = studentUserId, content = emptyMaterialAnnotationContent(), createdAt = now)
        sanitizeStoredParallel(lessonId, materialId, entity)
        partitionForStudent(lessonId, materialId, entity, request.content)
        entity.updatedAt = now
        return parallelAnnotations.saveAndFlush(entity).toResponse(objectMapper)
    }

    private fun sanitizeStoredParallel(lessonId: UUID, materialId: UUID, entity: LessonMaterialParallelAnnotationEntity) {
        if (!partitionForStudent(lessonId, materialId, entity, objectMapper.readTree(entity.content))) {
            // The old content was retained in the teacher-only archive; never return it to a student.
            entity.content = emptyMaterialAnnotationContent()
            entity.updatedAt = Instant.now()
        }
    }

    private fun partitionForStudent(
        lessonId: UUID,
        materialId: UUID,
        entity: LessonMaterialParallelAnnotationEntity,
        incoming: com.fasterxml.jackson.databind.JsonNode,
    ): Boolean {
        val historical = findMaterialAnnotation(lessonId, materialId)?.content?.let(objectMapper::readTree)
        val result = ParallelAnnotationPartition(objectMapper).split(historical, incoming)
        if (result.quarantine) {
            val content = objectMapper.writeValueAsString(incoming)
            val hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.toByteArray(Charsets.UTF_8)))
            if (!parallelSnapshots.existsByLessonIdAndMaterialIdAndContentHash(lessonId, materialId, hash)) {
                val now = Instant.now().truncatedTo(ChronoUnit.MICROS)
                val last = parallelSnapshots.findTopByLessonIdAndMaterialIdOrderByCreatedAtDescIdDesc(lessonId, materialId)?.createdAt
                // Writers hold the lesson lock; monotonic timestamps keep existing pages stable as snapshots arrive.
                val createdAt = if (last != null && !now.isAfter(last)) last.plus(1, ChronoUnit.MICROS) else now
                parallelSnapshots.save(LessonMaterialParallelAnnotationSnapshotEntity(
                    lessonId = lessonId, materialId = materialId,
                    contentHash = hash, content = content, createdAt = createdAt,
                ))
            }
        }
        if (result.personal != null) entity.content = objectMapper.writeValueAsString(result.personal)
        return result.personal != null
    }

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

private fun LessonMaterialParallelAnnotationEntity.toResponse(objectMapper: ObjectMapper): MaterialAnnotationResponse =
    MaterialAnnotationResponse(
        id = id, lessonId = lessonId, materialId = materialId, content = objectMapper.readTree(content),
        createdAt = createdAt, updatedAt = updatedAt,
    )
