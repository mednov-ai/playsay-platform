package com.playsay.email.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "email_delivery_attempts")
class EmailDeliveryAttemptEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "idempotency_key", nullable = false, unique = true, length = 255)
    var idempotencyKey: String = "",
    @Column(name = "to_email", nullable = false, length = 320)
    var toEmail: String = "",
    @Column(name = "template_key", nullable = false, length = 120)
    var templateKey: String = "",
    @Column(name = "locale", nullable = false, length = 16)
    var locale: String = "ru",
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "PENDING",
    @Column(name = "subject", length = 255)
    var subject: String? = null,
    @Column(name = "error_message", length = 1024)
    var errorMessage: String? = null,
    @Column(name = "provider", length = 32)
    var provider: String? = null,
    @Column(name = "provider_job_id", length = 160)
    var providerJobId: String? = null,
    @Column(name = "provider_status", length = 32)
    var providerStatus: String? = null,
    @Column(name = "provider_delivery_status", length = 96)
    var providerDeliveryStatus: String? = null,
    @Column(name = "provider_destination_response", length = 1024)
    var providerDestinationResponse: String? = null,
    @Column(name = "provider_event_at")
    var providerEventAt: Instant? = null,
    @Column(name = "provider_checked_at")
    var providerCheckedAt: Instant? = null,
    @Column(name = "provider_tracking_until")
    var providerTrackingUntil: Instant? = null,
    @Column(name = "provider_attempt_count", nullable = false)
    var providerAttemptCount: Int = 0,
    @Column(name = "replay_ciphertext", columnDefinition = "TEXT")
    var replayCiphertext: String? = null,
    @Column(name = "replay_nonce", length = 64)
    var replayNonce: String? = null,
    @Column(name = "replay_until")
    var replayUntil: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
