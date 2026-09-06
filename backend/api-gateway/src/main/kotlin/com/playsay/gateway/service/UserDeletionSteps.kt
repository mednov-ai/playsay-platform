package com.playsay.gateway.service

import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.client.UserDataPurgeClient
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.UserDeletionOperationRepo
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class UserDeletionSteps(
    private val operationRepo: UserDeletionOperationRepo,
    private val appUserRepo: AppUserRepo,
    private val ownershipService: UserOwnershipTransferService,
    private val teacherCleanup: UserTeacherDeletionCleanup,
    private val studentCleanup: UserStudentDeletionCleanup,
    private val userDataPurgeClient: UserDataPurgeClient,
    private val registrationGateway: RegistrationGateway,
    private val clock: Clock,
) {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun advance(operationId: UUID): Boolean {
        val operation = operationRepo.lockById(operationId) ?: return false
        if (operation.status in setOf("COMPLETED", "FAILED")) return false
        operation.status = "RUNNING"
        operation.errorCode = null
        when (operation.stage) {
            "LEGACY", "REQUESTED" -> {
                registrationGateway.suspendUser(operation.targetSubject)
                operation.stage = "SUSPENDED"
            }
            "SUSPENDED" -> {
                operation.replacementTeacherUserId?.let {
                    ownershipService.transferTeacherOwnership(operation.targetUserId, it, operation.requestedByUserId)
                }
                teacherCleanup.detachDeletedTeacher(operation.targetUserId)
                ownershipService.revokeTeacherDelegations(operation.targetUserId, operation.requestedByUserId)
                studentCleanup.removeFutureStudentAssignments(operation.targetUserId)
                operation.stage = "LOCAL_CLEANED"
            }
            "LOCAL_CLEANED" -> {
                userDataPurgeClient.purge(operation.targetSubject)
                operation.stage = "DATA_PURGED"
            }
            "DATA_PURGED" -> {
                registrationGateway.deleteUser(operation.targetSubject)
                operation.stage = "IDENTITY_DELETED"
            }
            "IDENTITY_DELETED" -> {
                val target = appUserRepo.findById(operation.targetUserId).orElseThrow()
                studentCleanup.clearProfiles(target.id)
                val now = Instant.now(clock)
                target.username = null
                target.email = null
                target.name = null
                target.roles = null
                target.displayName = null
                target.avatarUrl = null
                target.locale = null
                target.countryCode = null
                target.timezone = null
                target.learningGoal = null
                target.managedByTeacher = false
                target.managedByTeacherUserId = null
                target.deletedAt = now
                target.deletedByUserId = operation.requestedByUserId
                target.updatedAt = now
                appUserRepo.saveAndFlush(target)
                operation.stage = "COMPLETED"
                operation.status = "COMPLETED"
                operation.completedAt = now
            }
            else -> error("Unsupported user deletion stage")
        }
        operation.updatedAt = Instant.now(clock)
        operationRepo.saveAndFlush(operation)
        return operation.status != "COMPLETED"
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun fail(operationId: UUID) {
        val operation = operationRepo.lockById(operationId) ?: return
        if (operation.status == "COMPLETED") return
        operation.status = "FAILED"
        operation.errorCode = "USER_DELETE_FAILED"
        operation.updatedAt = Instant.now(clock)
        operationRepo.saveAndFlush(operation)
    }
}
