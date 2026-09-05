package com.playsay.gateway.service.assignment

import com.playsay.gateway.dto.AssignmentSummaryResponse
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.StudentVocabularyAssignmentDetailResponse
import com.playsay.gateway.dto.TeacherAssignmentDetailResponse
import com.playsay.gateway.dto.TeacherAssignmentSubmissionDetailResponse
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.mapper.LessonMaterialResponseMapper
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.SubmissionRepo
import com.playsay.gateway.service.AssignmentAccessPolicy
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

@Component
class AssignmentQueryService(
    private val assignmentRepo: AssignmentRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val submissionRepo: SubmissionRepo,
    private val assignmentAccessPolicy: AssignmentAccessPolicy,
    private val materialResolver: AssignmentMaterialResolver,
    private val materialResponseMapper: LessonMaterialResponseMapper,
    private val projectionService: AssignmentProjectionService,
) {
    fun listTeacher(currentUserId: UUID, isAdmin: Boolean): List<AssignmentSummaryResponse> {
        val assignments = assignmentRepo.findByTypeAndStatusNotOrderByUpdatedAtDesc(
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        )
        return assignmentAccessPolicy.resolveTeacherScopes(assignments, currentUserId, isAdmin)
            .asSequence()
            .mapNotNull { scope ->
                projectionService.summaryIfMaterialAvailable(
                    assignment = scope.assignment,
                    visibleRecipientIds = scope.visibleRecipientIds,
                )
            }
            .toList()
    }

    fun findVocabularyByPlan(teacherUserId: UUID, planId: UUID): AssignmentEntity? =
        assignmentRepo.findByTeacherUserIdAndPracticePlanId(teacherUserId, planId)

    fun findVocabularyBySourcePractice(teacherUserId: UUID, sourcePracticeId: UUID): AssignmentEntity? =
        assignmentRepo.findByTeacherUserIdAndSourceVocabularyPracticeId(teacherUserId, sourcePracticeId)

    fun teacherDetail(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
    ): TeacherAssignmentDetailResponse {
        val scope = assignmentAccessPolicy.requireManagedHomework(authentication, assignmentId)
        return TeacherAssignmentDetailResponse(
            assignment = projectionService.summary(scope.assignment, visibleRecipientIds = scope.visibleRecipientIds),
            recipients = projectionService.recipientProgress(scope.assignment, scope.visibleRecipientIds),
        )
    }

    fun teacherSubmissionDetail(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
        submissionId: UUID,
    ): TeacherAssignmentSubmissionDetailResponse {
        val scope = assignmentAccessPolicy.requireManagedHomework(authentication, assignmentId)
        val assignment = scope.assignment
        requireMaterialAssignment(assignment)
        val submission = submissionRepo.findMaterialSubmissionRowById(submissionId)
            ?.takeIf { row ->
                row.assignmentId == assignment.id && row.submittedAt != null && scope.includes(row.userId)
            }
            ?: throw assignmentNotFound()
        val material = materialResolver.require(requireNotNull(assignment.materialId))
        return TeacherAssignmentSubmissionDetailResponse(
            material = materialResponseMapper.toResponse(material),
            submission = projectionService.submission(submission, assignment, scope.visibleRecipientIds),
        )
    }

    fun requireTeacherRecipient(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
        studentSubject: String,
    ) = assignmentAccessPolicy.requireManagedHomeworkRecipient(authentication, assignmentId, studentSubject)

    fun listStudent(userId: UUID): List<AssignmentSummaryResponse> =
        assignmentRecipientRepo.findByStudentUserIdAndArchivedAtIsNullOrderByUpdatedAtDesc(userId)
            .mapNotNull { recipient ->
                assignmentRepo.findByIdAndTypeAndStatusNot(
                    id = recipient.assignmentId,
                    type = MetaData.AssignmentTypes.HOMEWORK,
                    status = MetaData.AssignmentStatuses.ARCHIVED,
                )
            }
            .filter { assignment -> assignment.status == MetaData.AssignmentStatuses.ACTIVE }
            .mapNotNull { assignment -> projectionService.summaryIfMaterialAvailable(assignment, userId) }

    fun requireStudentAssignment(assignmentId: UUID, studentUserId: UUID): AssignmentEntity {
        if (assignmentRecipientRepo.countByAssignmentIdAndStudentUserId(assignmentId, studentUserId) == 0L) {
            throw assignmentNotFound()
        }
        return assignmentRepo.findByIdAndTypeAndStatusNot(
            id = assignmentId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        )?.takeIf { assignment -> assignment.status == MetaData.AssignmentStatuses.ACTIVE }
            ?: throw assignmentNotFound()
    }

    fun studentMaterial(assignmentId: UUID, userId: UUID): LessonMaterialResponse {
        val assignment = requireStudentAssignment(assignmentId, userId)
        requireMaterialAssignment(assignment)
        return materialResponseMapper.toResponse(materialResolver.require(requireNotNull(assignment.materialId)))
    }

    fun studentVocabularyDetail(assignmentId: UUID, userId: UUID): StudentVocabularyAssignmentDetailResponse {
        val assignment = requireStudentAssignment(assignmentId, userId)
        if (assignment.contentKind != MetaData.AssignmentContentKinds.VOCABULARY_PRACTICE) throw assignmentNotFound()
        val recipient = assignmentRecipientRepo.findByAssignmentIdAndStudentUserId(assignmentId, userId)
            ?: throw assignmentNotFound()
        return StudentVocabularyAssignmentDetailResponse(
            assignment = projectionService.summary(assignment, userId),
            practiceId = assignment.activityRef
                ?: throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.ASSIGNMENT_NOT_READY),
            sessionId = recipient.activityRef
                ?: throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.ASSIGNMENT_NOT_READY),
            learnerSnapshotId = recipient.learnerSnapshotId ?: recipient.activityRef
                ?: throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.ASSIGNMENT_NOT_READY),
        )
    }

    private fun requireMaterialAssignment(assignment: AssignmentEntity) {
        if (assignment.contentKind != MetaData.AssignmentContentKinds.MATERIAL || assignment.materialId == null) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
    }

    private fun assignmentNotFound(): ProjectResponseException =
        ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
}
