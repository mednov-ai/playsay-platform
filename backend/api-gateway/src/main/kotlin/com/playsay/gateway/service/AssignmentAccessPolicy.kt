package com.playsay.gateway.service

import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.AssignmentRecipientEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class AssignmentAccessPolicy(
    private val assignmentRepo: AssignmentRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val userProfileStore: UserProfileStore,
    private val studentAccessPolicy: StudentAccessPolicy,
) {
    @Transactional(readOnly = true)
    fun requireManagedHomework(
        authentication: JwtAuthenticationToken,
        assignmentId: UUID,
    ): AssignmentEntity {
        val assignment = assignmentRepo.findByIdAndTypeAndStatusNot(
            id = assignmentId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        ) ?: throw assignmentNotFound()
        if (!canManage(authentication, assignment)) {
            throw assignmentNotFound()
        }
        return assignment
    }

    @Transactional(readOnly = true)
    fun canManageMaterial(authentication: JwtAuthenticationToken, materialId: UUID): Boolean =
        assignmentRepo.findByMaterialIdAndTypeAndStatusNot(
            materialId = materialId,
            type = MetaData.AssignmentTypes.HOMEWORK,
            status = MetaData.AssignmentStatuses.ARCHIVED,
        ).any { assignment -> canManage(authentication, assignment) }

    private fun canManage(authentication: JwtAuthenticationToken, assignment: AssignmentEntity): Boolean {
        if (authentication.authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }) {
            return true
        }
        if (authentication.authorities.none { authority -> authority.authority == MetaData.Authorities.TEACHER }) {
            return false
        }
        val actorUserId = userProfileStore.currentUserId(authentication)
        return assignment.teacherUserId == actorUserId || canAccessEveryRecipient(actorUserId, assignment.id)
    }

    private fun canAccessEveryRecipient(actorUserId: UUID, assignmentId: UUID): Boolean =
        studentAccessPolicy.canAccessEveryStudent(
            actorUserId,
            assignmentRecipientRepo.findByAssignmentIdOrderByCreatedAtAsc(assignmentId)
                .filter { recipient -> recipient.archivedAt == null }
                .map(AssignmentRecipientEntity::studentUserId),
        )

    private fun assignmentNotFound(): ProjectResponseException =
        ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
}
