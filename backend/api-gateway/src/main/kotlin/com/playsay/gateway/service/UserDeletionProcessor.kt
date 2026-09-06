package com.playsay.gateway.service

import com.playsay.gateway.repo.UserDeletionOperationRepo
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.scheduling.annotation.Async
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class UserDeletionRequestedListener(private val processor: UserDeletionProcessor) {
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onRequested(event: UserDeletionRequestedEvent) {
        processor.process(event.operationId)
    }
}

@Service
class UserDeletionProcessor(
    private val steps: UserDeletionSteps,
    private val operationRepo: UserDeletionOperationRepo,
    private val clock: Clock,
) {
    fun process(operationId: UUID) {
        try {
            repeat(6) {
                if (!steps.advance(operationId)) return
            }
        } catch (_: Exception) {
            // A separate transaction records the failure; external steps are safe to repeat.
            steps.fail(operationId)
        }
    }

    @Scheduled(fixedDelay = 30_000, initialDelay = 30_000)
    fun recoverInterrupted() {
        operationRepo.findTop20ByStatusInAndUpdatedAtBeforeOrderByUpdatedAtAsc(
            listOf("PENDING", "RUNNING"), Instant.now(clock).minusSeconds(30),
        ).forEach { process(it.id) }
    }
}
