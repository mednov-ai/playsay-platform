package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.MaterialSubmissionResponse
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.SubmissionEntity
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.repo.MaterialSubmissionRow
import com.playsay.gateway.repo.SubmissionRepo
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Component

private typealias StoredMaterialSubmission = MaterialSubmissionRow

@Component
class MaterialSubmissionService(
    private val assignmentRepo: AssignmentRepo,
    private val submissionRepo: SubmissionRepo,
    private val materialScoringService: MaterialScoringService,
    private val materialRequestValidator: MaterialRequestValidator,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    fun getOrCreateForScheduledLesson(
        lessonId: UUID,
        material: LessonMaterialRow,
        userId: UUID,
    ): MaterialSubmissionResponse {
        val assignmentId = findOrCreateMaterialSubmissionAssignment(lessonId, material)
        val submission = findMaterialSubmission(assignmentId, lessonId, userId)
            ?: createEmptyMaterialSubmission(assignmentId, lessonId, material.id, userId)
        return submission.toResponse(objectMapper)
    }

    fun listForScheduledLesson(lessonId: UUID, materialId: UUID): List<MaterialSubmissionResponse> {
        val assignmentId = findMaterialSubmissionAssignment(lessonId, materialId) ?: return emptyList()
        return submissionRepo.findMaterialSubmissionRows(assignmentId, lessonId)
            .map { submission -> submission.toResponse(objectMapper) }
    }

    fun saveForScheduledLesson(
        lessonId: UUID,
        material: LessonMaterialRow,
        userId: UUID,
        request: MaterialSubmissionRequest,
    ): MaterialSubmissionResponse {
        materialRequestValidator.validateJsonSize("content", request.content, 1_000_000)
        return saveMaterialSubmission(
            lessonId = lessonId,
            material = material,
            studentUserId = userId,
            yjsDocumentId = null,
            content = request.content,
            submitted = request.submitted,
        )
    }

    fun saveCollaborationSubmission(
        lessonId: UUID,
        material: LessonMaterialRow,
        studentUserId: UUID,
        yjsDocumentId: String,
        content: JsonNode,
        submitted: Boolean,
    ): MaterialSubmissionResponse {
        materialRequestValidator.validateJsonSize("content", content, 1_000_000)
        return saveMaterialSubmission(
            lessonId = lessonId,
            material = material,
            studentUserId = studentUserId,
            yjsDocumentId = yjsDocumentId,
            content = content,
            submitted = submitted,
        )
    }

    private fun saveMaterialSubmission(
        lessonId: UUID,
        material: LessonMaterialRow,
        studentUserId: UUID,
        yjsDocumentId: String?,
        content: JsonNode,
        submitted: Boolean,
    ): MaterialSubmissionResponse {
        val assignmentId = findOrCreateMaterialSubmissionAssignment(lessonId, material)
        val now = Instant.now()
        val scoring = materialScoringService.score(material.document, material.scoringRubric, content)
        val storedContent = objectMapper.writeValueAsString(scoring?.content ?: content)
        val existing = findMaterialSubmission(assignmentId, lessonId, studentUserId)

        val submissionId = if (existing == null) {
            submissionRepo.saveAndFlush(
                SubmissionEntity(
                    id = UUID.randomUUID(),
                    assignmentId = assignmentId,
                    studentUserId = studentUserId,
                    lessonId = lessonId,
                    yjsDocumentId = yjsDocumentId,
                    content = storedContent,
                    score = scoring?.score,
                    errorsCount = scoring?.errorsCount,
                    submittedAt = if (submitted) now else null,
                    createdAt = now,
                    updatedAt = now,
                ),
            ).id
        } else {
            val entity = submissionRepo.findById(existing.id).orElseThrow()
            if (yjsDocumentId != null) {
                entity.yjsDocumentId = yjsDocumentId
            }
            entity.content = storedContent
            entity.score = scoring?.score
            entity.errorsCount = scoring?.errorsCount
            if (submitted) {
                entity.submittedAt = now
            }
            entity.updatedAt = now
            submissionRepo.save(entity)
            existing.id
        }

        return requireNotNull(findMaterialSubmission(submissionId)).toResponse(objectMapper)
    }

    private fun findOrCreateMaterialSubmissionAssignment(lessonId: UUID, material: LessonMaterialRow): UUID =
        findMaterialSubmissionAssignment(lessonId, material.id) ?: run {
            val now = Instant.now()
            assignmentRepo.saveAndFlush(
                AssignmentEntity(
                    id = UUID.randomUUID(),
                    lessonId = lessonId,
                    title = material.title,
                    instructions = "Play&Say material answer snapshot",
                    type = MetaData.AssignmentTypes.MATERIAL_WORK,
                    payload = objectMapper.writeValueAsString(objectMapper.createObjectNode().put("source", "material")),
                    maxScore = materialScoringService.maxScore(material.scoringRubric),
                    materialId = material.id,
                    status = MetaData.AssignmentStatuses.ACTIVE,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
                .id
        }

    private fun createEmptyMaterialSubmission(
        assignmentId: UUID,
        lessonId: UUID,
        materialId: UUID,
        userId: UUID,
    ): StoredMaterialSubmission {
        val now = Instant.now()
        val submission = submissionRepo.saveAndFlush(
            SubmissionEntity(
                id = UUID.randomUUID(),
                assignmentId = assignmentId,
                studentUserId = userId,
                lessonId = lessonId,
                content = emptyMaterialSubmissionContent(materialId),
                score = null,
                errorsCount = null,
                submittedAt = null,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return requireNotNull(findMaterialSubmission(submission.id))
    }

    private fun emptyMaterialSubmissionContent(materialId: UUID): String {
        val root = objectMapper.createObjectNode()
        root.put("schemaVersion", 1)
        root.put("materialId", materialId.toString())
        root.set<ObjectNode>("answers", objectMapper.createObjectNode())
        return objectMapper.writeValueAsString(root)
    }

    private fun findMaterialSubmissionAssignment(lessonId: UUID, materialId: UUID): UUID? =
        assignmentRepo.findFirstByLessonIdAndMaterialIdAndMaterialBlockIdIsNullAndTypeOrderByCreatedAtAsc(
            lessonId = lessonId,
            materialId = materialId,
            type = MetaData.AssignmentTypes.MATERIAL_WORK,
        )?.id

    private fun findMaterialSubmission(assignmentId: UUID, lessonId: UUID, userId: UUID): StoredMaterialSubmission? =
        submissionRepo.findFirstByAssignmentIdAndLessonIdAndStudentUserIdOrderByUpdatedAtDesc(
            assignmentId = assignmentId,
            lessonId = lessonId,
            studentUserId = userId,
        )?.let { submission -> findMaterialSubmission(submission.id) }

    private fun findMaterialSubmission(submissionId: UUID): StoredMaterialSubmission? =
        submissionRepo.findMaterialSubmissionRowById(submissionId)
}

private fun StoredMaterialSubmission.toResponse(objectMapper: ObjectMapper): MaterialSubmissionResponse =
    MaterialSubmissionResponse(
        id = id,
        assignmentId = assignmentId,
        lessonId = requireNotNull(lessonId),
        materialId = requireNotNull(materialId),
        userId = userId,
        userSubject = userSubject,
        userName = userName,
        content = objectMapper.readTree(requireNotNull(content)),
        score = score,
        errorsCount = errorsCount,
        submittedAt = submittedAt,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
