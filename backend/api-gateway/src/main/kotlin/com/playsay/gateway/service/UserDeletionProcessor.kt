package com.playsay.gateway.service
import com.playsay.gateway.client.RegistrationGateway

import com.playsay.gateway.client.UserDataPurgeClient
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.UserDeletionOperationRepo
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class UserDeletionRequestedListener(
    private val processor: UserDeletionProcessor,
) {
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onRequested(event: UserDeletionRequestedEvent) {
        processor.process(event.operationId)
    }
}

@Service
class UserDeletionProcessor(
    private val operationRepo: UserDeletionOperationRepo,
    private val appUserRepo: AppUserRepo,
    private val ownershipService: UserOwnershipTransferService,
    private val userDataPurgeClient: UserDataPurgeClient,
    private val registrationGateway: RegistrationGateway,
    private val clock: Clock,
) {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun process(operationId: UUID) {
        val operation = operationRepo.findById(operationId).orElse(null) ?: return
        if (operation.status == "COMPLETED") return
        operation.status = "RUNNING"
        operation.errorCode = null
        operation.updatedAt = Instant.now(clock)
        operationRepo.saveAndFlush(operation)

        runCatching {
            val target = appUserRepo.findById(operation.targetUserId).orElseThrow()
            operation.replacementTeacherUserId?.let { replacementId ->
                ownershipService.transferTeacherOwnership(target.id, replacementId, operation.requestedByUserId)
            }
            ownershipService.revokeTeacherDelegations(target.id, operation.requestedByUserId)
            ownershipService.removeFutureStudentAssignments(target.id)
            userDataPurgeClient.purge(operation.targetSubject)
            registrationGateway.deleteUser(operation.targetSubject)
            ownershipService.clearProfiles(target.id)
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
            operation.status = "COMPLETED"
            operation.completedAt = now
            operation.updatedAt = now
        }.onFailure {
            operation.status = "FAILED"
            operation.errorCode = "USER_DELETE_FAILED"
            operation.updatedAt = Instant.now(clock)
        }
        operationRepo.saveAndFlush(operation)
    }
}
