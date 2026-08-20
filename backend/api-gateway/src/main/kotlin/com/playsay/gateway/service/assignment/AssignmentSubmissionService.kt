package com.playsay.gateway.service.assignment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.AssignmentSubmissionResponse
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.StudentAssignmentDetailResponse
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.SubmissionEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.mapper.LessonMaterialResponseMapper
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.MaterialSubmissionRow
import com.playsay.gateway.repo.SubmissionRepo
import com.playsay.gateway.service.MaterialScoringService
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

@Component
class AssignmentSubmissionService(
    private val assignmentRepo: AssignmentRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val submissionRepo: SubmissionRepo,
    private val materialResolver: AssignmentMaterialResolver,
    private val scoringService: MaterialScoringService,
    private val materialResponseMapper: LessonMaterialResponseMapper,
    private val queryService: AssignmentQueryService,
    private val projectionService: AssignmentProjectionService,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun studentDetail(assignmentId: UUID, userId: UUID): StudentAssignmentDetailResponse {
        val assignment = requireMaterialAssignment(queryService.requireStudentAssignment(assignmentId, userId))
        val material = materialResolver.require(requireNotNull(assignment.materialId))
        val submission = findHomeworkSubmission(assignment.id, userId)
            ?: createEmptyHomeworkSubmission(assignment, material.id, userId)
        return StudentAssignmentDetailResponse(
            assignment = projectionService.summary(assignment),
            material = materialResponseMapper.toResponse(material),
            submission = projectionService.submission(submission, assignment),
        )
    }

    fun studentSubmission(assignmentId: UUID, userId: UUID): AssignmentSubmissionResponse {
        val assignment = requireMaterialAssignment(queryService.requireStudentAssignment(assignmentId, userId))
        val material = materialResolver.require(requireNotNull(assignment.materialId))
        val submission = findHomeworkSubmission(assignment.id, userId)
            ?: createEmptyHomeworkSubmission(assignment, material.id, userId)
        return projectionService.submission(submission, assignment)
    }

    fun saveStudentSubmission(
        assignmentId: UUID,
        userId: UUID,
        request: MaterialSubmissionRequest,
    ): AssignmentSubmissionResponse {
        val assignment = requireMaterialAssignment(queryService.requireStudentAssignment(assignmentId, userId))
        val material = materialResolver.require(requireNotNull(assignment.materialId))
        validateJsonSize("content", request.content, 1_000_000)
        val now = Instant.now()
        val scoring = scoringService.score(material.document, material.scoringRubric, request.content)
        val content = objectMapper.writeValueAsString(scoring?.content ?: request.content)
        val submissionId = persistSubmission(assignment, userId, request.submitted, content, scoring?.score, scoring?.errorsCount, now)

        val recipient = assignmentRecipientRepo.findByAssignmentIdAndStudentUserId(assignment.id, userId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
        recipient.updatedAt = now
        assignmentRecipientRepo.save(recipient)
        assignment.updatedAt = now
        assignmentRepo.save(assignment)

        return projectionService.submission(requireNotNull(findSubmissionById(submissionId)), assignment)
    }

    private fun persistSubmission(
        assignment: AssignmentEntity,
        userId: UUID,
        submitted: Boolean,
        content: String,
        score: java.math.BigDecimal?,
        errorsCount: Int?,
        now: Instant,
    ): UUID {
        val existing = findHomeworkSubmission(assignment.id, userId)
        if (existing == null) {
            return submissionRepo.saveAndFlush(
                SubmissionEntity(
                    id = UUID.randomUUID(),
                    assignmentId = assignment.id,
                    studentUserId = userId,
                    lessonId = assignment.lessonId,
                    content = content,
                    score = score,
                    errorsCount = errorsCount,
                    submittedAt = now.takeIf { submitted },
                    createdAt = now,
                    updatedAt = now,
                ),
            ).id
        }
        val entity = submissionRepo.findById(existing.id).orElseThrow()
        entity.content = content
        entity.score = score
        entity.errorsCount = errorsCount
        if (submitted) entity.submittedAt = now
        entity.updatedAt = now
        submissionRepo.save(entity)
        return existing.id
    }

    private fun createEmptyHomeworkSubmission(
        assignment: AssignmentEntity,
        materialId: UUID,
        userId: UUID,
    ): MaterialSubmissionRow {
        val now = Instant.now()
        val submission = submissionRepo.saveAndFlush(
            SubmissionEntity(
                id = UUID.randomUUID(),
                assignmentId = assignment.id,
                studentUserId = userId,
                lessonId = assignment.lessonId,
                content = emptyHomeworkSubmissionContent(materialId),
                score = null,
                errorsCount = null,
                submittedAt = null,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return requireNotNull(findSubmissionById(submission.id))
    }

    private fun findHomeworkSubmission(assignmentId: UUID, userId: UUID): MaterialSubmissionRow? =
        submissionRepo.findFirstByAssignmentIdAndStudentUserIdOrderByUpdatedAtDesc(assignmentId, userId)
            ?.let { submission -> findSubmissionById(submission.id) }

    private fun findSubmissionById(submissionId: UUID): MaterialSubmissionRow? =
        submissionRepo.findMaterialSubmissionRowById(submissionId)

    private fun requireMaterialAssignment(assignment: AssignmentEntity): AssignmentEntity {
        if (assignment.contentKind != MetaData.AssignmentContentKinds.MATERIAL || assignment.materialId == null) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return assignment
    }

    private fun emptyHomeworkSubmissionContent(materialId: UUID): String =
        objectMapper.writeValueAsString(
            objectMapper.createObjectNode().apply {
                put("schemaVersion", 1)
                put("materialId", materialId.toString())
                set<JsonNode>("answers", objectMapper.createObjectNode())
            },
        )

    private fun validateJsonSize(fieldName: String, value: JsonNode, maxBytes: Int) {
        if (objectMapper.writeValueAsBytes(value).size > maxBytes) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.JSON_FIELD_TOO_LARGE,
                fieldName,
                maxBytes,
            )
        }
    }
}
