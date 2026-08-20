package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "vocabulary_assignment_progress_event")
class VocabularyAssignmentProgressEventEntity(
    @Id @Column(name = "event_id", nullable = false) var eventId: UUID = UUID.randomUUID(),
    @Column(name = "assignment_id", nullable = false) var assignmentId: UUID = UUID.randomUUID(),
    @Column(name = "session_id", nullable = false) var sessionId: UUID = UUID.randomUUID(),
    @Column(name = "session_revision", nullable = false) var sessionRevision: Long = 0,
    @Column(name = "processed_at", nullable = false) var processedAt: Instant = Instant.now(),
)
