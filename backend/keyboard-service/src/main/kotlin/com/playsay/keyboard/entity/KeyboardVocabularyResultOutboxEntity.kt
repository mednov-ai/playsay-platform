package com.playsay.keyboard.entity

import com.playsay.integration.delivery.IntegrationDeliveryState
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "keyboard_vocabulary_result_outbox")
class KeyboardVocabularyResultOutboxEntity {
    @Id var id: UUID = UUID.randomUUID()
    @Column(name = "training_result_id", nullable = false) var trainingResultId: Long = 0
    @Column(name = "session_id", nullable = false) var sessionId: UUID = UUID.randomUUID()
    @Column(nullable = false, columnDefinition = "TEXT") var payload: String = "{}"
    @Column(nullable = false, length = 24) var status: String = IntegrationDeliveryState.PENDING.persistedValue
    @Column(name = "attempt_count", nullable = false) var attemptCount: Int = 0
    @Column(name = "next_attempt_at", nullable = false) var nextAttemptAt: Instant = Instant.EPOCH
    @Column(name = "last_error", length = 240) var lastError: String? = null
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.EPOCH
}
