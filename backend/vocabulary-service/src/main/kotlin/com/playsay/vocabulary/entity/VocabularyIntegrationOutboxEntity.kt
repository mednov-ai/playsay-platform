package com.playsay.vocabulary.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "vocabulary_integration_outbox")
class VocabularyIntegrationOutboxEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "assignment_id", nullable = false) var assignmentId: UUID = UUID.randomUUID(),
    @Column(name = "session_id", nullable = false) var sessionId: UUID = UUID.randomUUID(),
    @Column(name = "session_revision", nullable = false) var sessionRevision: Long = 0,
    @Column(nullable = false, columnDefinition = "TEXT") var payload: String = "{}",
    @Column(nullable = false, length = 24) var status: String = "PENDING",
    @Column(name = "attempt_count", nullable = false) var attemptCount: Int = 0,
    @Column(name = "next_attempt_at", nullable = false) var nextAttemptAt: Instant = Instant.EPOCH,
    @Column(name = "last_error", length = 240) var lastError: String? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.EPOCH,
)
