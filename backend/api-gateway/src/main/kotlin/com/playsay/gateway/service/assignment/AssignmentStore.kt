package com.playsay.gateway.service.assignment

import com.playsay.gateway.dto.AssignmentSubmissionResponse
import com.playsay.gateway.dto.AssignmentSummaryResponse
import com.playsay.gateway.dto.HomeworkAssignmentRequest
import com.playsay.gateway.dto.LessonHomeworkRequest
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.StudentAssignmentDetailResponse
import com.playsay.gateway.dto.StudentVocabularyAssignmentDetailResponse
import com.playsay.gateway.dto.TeacherAssignmentDetailResponse
import com.playsay.gateway.dto.TeacherAssignmentSubmissionDetailResponse
import com.playsay.gateway.dto.VocabularyAssignmentPreparationResponse
import com.playsay.gateway.dto.VocabularyAssignmentProgressUpdateRequest
import com.playsay.gateway.dto.VocabularyHomeworkRequest
import com.playsay.gateway.dto.VocabularyHomeworkReviewRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.UserProfileStore
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class AssignmentStore(
    private val userProfileStore: UserProfileStore,
    private val assignmentCreationService: AssignmentCreationService,
    private val assignmentEventPublisher: AssignmentEventPublisher,
    private val assignmentQueryService: AssignmentQueryService,
    private val assignmentSubmissionService: AssignmentSubmissionService,
    private val vocabularyAssignmentIntegrationService: VocabularyAssignmentIntegrationService,
) {
    @Transactional
    fun createHomework(authentication: JwtAuthenticationToken, request: HomeworkAssignmentRequest): TeacherAssignmentDetailResponse {
        authentication.requireAssignmentManager()
        val teacherUserId = userProfileStore.currentUserId(authentication)
        val result = assignmentCreationService.createMaterialHomework(
            teacherUserId = teacherUserId,
            isAdmin = authentication.isAssignmentAdmin(),
            request = request,
        )
        assignmentEventPublisher.publish(
            authentication.token.subject,
            result.assignmentId,
            result.recipients,
            result.change,
        )
        return teacherDetail(authentication, result.assignmentId)
    }

    @Transactional
    fun createVocabularyHomework(
        authentication: JwtAuthenticationToken,
        request: VocabularyHomeworkRequest,
    ): TeacherAssignmentDetailResponse {
        authentication.requireAssignmentManager()
        val teacherUserId = userProfileStore.currentUserId(authentication)
        val result = assignmentCreationService.createVocabularyHomework(teacherUserId, request)
        vocabularyAssignmentIntegrationService.enqueuePreparation(result, authentication.token.subject, request)
        return teacherDetail(authentication, result.assignmentId)
    }

    @Transactional(readOnly = true)
    fun findVocabularyHomeworkByPlan(
        authentication: JwtAuthenticationToken,
        planId: UUID,
    ): TeacherAssignmentDetailResponse? {
        authentication.requireAssignmentManager()
        val teacherUserId = userProfileStore.currentUserId(authentication)
        val assignment = assignmentQueryService.findVocabularyByPlan(teacherUserId, planId) ?: return null
        return teacherDetail(authentication, assignment.id)
    }

    @Transactional(readOnly = true)
    fun findVocabularyHomeworkBySourcePractice(
        authentication: JwtAuthenticationToken,
        sourcePracticeId: UUID,
    ): TeacherAssignmentDetailResponse? {
        authentication.requireAssignmentManager()
        val teacherUserId = userProfileStore.currentUserId(authentication)
        val assignment = assignmentQueryService.findVocabularyBySourcePractice(teacherUserId, sourcePracticeId) ?: return null
        return teacherDetail(authentication, assignment.id)
    }

    @Transactional
    fun createHomeworkFromLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: LessonHomeworkRequest,
    ): TeacherAssignmentDetailResponse {
        authentication.requireAssignmentManager()
        val currentUserId = userProfileStore.currentUserId(authentication)
        val result = assignmentCreationService.createLessonHomework(
            currentUserId,
            authentication.isAssignmentAdmin(),
            lessonId,
            request,
        )
        assignmentEventPublisher.publish(
            authentication.token.subject,
            result.assignmentId,
            result.recipients,
            result.change,
        )
        return teacherDetail(authentication, result.assignmentId)
    }

    @Transactional(readOnly = true)
    fun listTeacherAssignments(authentication: JwtAuthenticationToken): List<AssignmentSummaryResponse> {
        authentication.requireAssignmentManager()
        val currentUserId = userProfileStore.currentUserId(authentication)
        return assignmentQueryService.listTeacher(currentUserId, authentication.isAssignmentAdmin())
    }

    @Transactional(readOnly = true)
    fun teacherDetail(authentication: JwtAuthenticationToken, assignmentId: UUID): TeacherAssignmentDetailResponse {
        authentication.requireAssignmentManager()
        return assignmentQueryService.teacherDetail(authentication, assignmentId)
    }

    @Transactional(readOnly = true)
    fun teacherSubmissionDetail(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
        submissionId: UUID,
    ): TeacherAssignmentSubmissionDetailResponse {
        authentication.requireAssignmentManager()
        return assignmentQueryService.teacherSubmissionDetail(authentication, assignmentId, submissionId)
    }

    @Transactional(readOnly = true)
    fun listStudentAssignments(authentication: JwtAuthenticationToken): List<AssignmentSummaryResponse> {
        val userId = userProfileStore.currentUserId(authentication)
        return assignmentQueryService.listStudent(userId)
    }

    @Transactional
    fun studentDetail(authentication: JwtAuthenticationToken, assignmentId: UUID): StudentAssignmentDetailResponse {
        val userId = userProfileStore.currentUserId(authentication)
        return assignmentSubmissionService.studentDetail(assignmentId, userId)
    }

    @Transactional(readOnly = true)
    fun studentMaterial(authentication: JwtAuthenticationToken, assignmentId: UUID): LessonMaterialResponse {
        val userId = userProfileStore.currentUserId(authentication)
        return assignmentQueryService.studentMaterial(assignmentId, userId)
    }

    @Transactional
    fun studentSubmission(authentication: JwtAuthenticationToken, assignmentId: UUID): AssignmentSubmissionResponse {
        val userId = userProfileStore.currentUserId(authentication)
        return assignmentSubmissionService.studentSubmission(assignmentId, userId)
    }

    @Transactional
    fun saveStudentSubmission(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
        request: MaterialSubmissionRequest,
    ): AssignmentSubmissionResponse {
        val userId = userProfileStore.currentUserId(authentication)
        return assignmentSubmissionService.saveStudentSubmission(assignmentId, userId, request)
    }

    @Transactional(readOnly = true)
    fun studentVocabularyDetail(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
    ): StudentVocabularyAssignmentDetailResponse {
        val userId = userProfileStore.currentUserId(authentication)
        return assignmentQueryService.studentVocabularyDetail(assignmentId, userId)
    }

    @Transactional
    fun applyVocabularyPreparation(
        assignmentId: UUID,
        response: VocabularyAssignmentPreparationResponse,
        actorSubject: String,
    ) {
        vocabularyAssignmentIntegrationService.applyPreparation(assignmentId, response, actorSubject)
    }

    @Transactional
    fun updateVocabularyProgress(
        assignmentId: UUID,
        request: VocabularyAssignmentProgressUpdateRequest,
    ) {
        vocabularyAssignmentIntegrationService.updateProgress(assignmentId, request)
    }

    @Transactional
    fun reviewVocabularyHomework(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
        studentSubject: String,
        request: VocabularyHomeworkReviewRequest,
    ): TeacherAssignmentDetailResponse {
        authentication.requireAssignmentManager()
        teacherDetail(authentication, assignmentId)
        vocabularyAssignmentIntegrationService.review(assignmentId, studentSubject, authentication.token.subject, request)
        return teacherDetail(authentication, assignmentId)
    }

}

private fun JwtAuthenticationToken.requireAssignmentManager() {
    if (!canManageAssignments()) {
        throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
    }
}

private fun JwtAuthenticationToken.canManageAssignments(): Boolean =
    authorities.any { authority ->
        authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN
    }

private fun JwtAuthenticationToken.isAssignmentAdmin(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }
