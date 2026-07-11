package com.playsay.aitutor.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "ai_tutor_session_events")
class SessionEventEntity(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long = 0,
    @Column(name = "session_id", nullable = false) var sessionId: UUID,
    @Column(name = "client_event_id", nullable = false, length = 128) var clientEventId: String,
    @Column(nullable = false, length = 40) var type: String,
    @Column(name = "payload_json", nullable = false, length = 16_000) var payloadJson: String,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)
