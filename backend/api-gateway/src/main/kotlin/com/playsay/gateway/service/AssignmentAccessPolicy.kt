package com.playsay.gateway.service

import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.AssignmentRecipientEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

data class HomeworkReadScope(
    val assignment: AssignmentEntity,
    val visibleRecipientIds: Set<UUID>?,
) {
    fun includes(studentUserId: UUID): Boolean = visibleRecipientIds?.contains(studentUserId) != false
}

@Component
class AssignmentAccessPolicy(
    private val assignmentRepo: AssignmentRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val appUserRepo: AppUserRepo,
    private val userProfileStore: UserProfileStore,
    private val studentAccessPolicy: StudentAccessPolicy,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun requireManagedHomework(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
    ): HomeworkReadScope {
        val assignment = assignmentRepo.findByIdAndTypeAndStatusNot(
            id = assignmentId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        ) ?: throw assignmentNotFound()
        return resolve(authentication, assignment) ?: throw assignmentNotFound()
    }

    @Transactional(readOnly = true)
    fun canManageMaterial(authentication: JwtAuthenticationToken, materialId: UUID): Boolean =
        assignmentRepo.findByMaterialIdAndTypeAndStatusNot(
            materialId = materialId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        ).any { assignment -> resolve(authentication, assignment) != null }

    fun resolveTeacherScope(
        assignment: AssignmentEntity,
        actorUserId: UUID,
        isAdmin: Boolean,
        at: Instant,
    ): HomeworkReadScope? {
        if (isAdmin || assignment.teacherUserId == actorUserId) {
            return HomeworkReadScope(assignment, visibleRecipientIds = null)
        }
        val visibleRecipientIds = assignmentRecipientRepo.findByAssignmentIdOrderByCreatedAtAsc(assignment.id)
            .asSequence()
            .filter { recipient -> recipient.archivedAt == null }
            .map(AssignmentRecipientEntity::studentUserId)
            .filter { studentUserId ->
                studentAccessPolicy.evaluate(actorUserId, studentUserId, at) != StudentAccessDecision.DENIED
            }
            .toSet()
        return visibleRecipientIds.takeIf(Set<UUID>::isNotEmpty)
            ?.let { ids -> HomeworkReadScope(assignment, ids) }
    }

    fun resolveTeacherScopes(
        assignments: Iterable<AssignmentEntity>,
        actorUserId: UUID,
        isAdmin: Boolean,
    ): List<HomeworkReadScope> {
        val at = Instant.now(clock)
        return assignments.mapNotNull { assignment ->
            resolveTeacherScope(assignment, actorUserId, isAdmin, at)
        }
    }

    @Transactional(readOnly = true)
    fun requireManagedHomeworkRecipient(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
        studentSubject: String,
    ) {
        val scope = requireManagedHomework(authentication, assignmentId)
        val student = appUserRepo.findByKeycloakSubject(studentSubject) ?: throw assignmentNotFound()
        val recipient = assignmentRecipientRepo.findByAssignmentIdAndStudentUserId(assignmentId, student.id)
            ?: throw assignmentNotFound()
        if (!scope.includes(recipient.studentUserId)) throw assignmentNotFound()
    }

    private fun resolve(
        authentication: JwtAuthenticationToken,
        assignment: AssignmentEntity,
    ): HomeworkReadScope? {
        if (authentication.authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }) {
            return HomeworkReadScope(assignment, visibleRecipientIds = null)
        }
        if (authentication.authorities.none { authority -> authority.authority == MetaData.Authorities.TEACHER }) {
            return null
        }
        val actorUserId = userProfileStore.currentUserId(authentication)
        return resolveTeacherScope(
            assignment = assignment,
            actorUserId = actorUserId,
            isAdmin = false,
            at = Instant.now(clock),
        )
    }

    private fun assignmentNotFound(): ProjectResponseException =
        ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
}
