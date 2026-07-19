package com.playsay.email.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "email_provider_attempt")
class EmailProviderAttemptEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "email_delivery_id", nullable = false)
    var emailDeliveryId: UUID = UUID.randomUUID(),
    @Column(name = "attempt_number", nullable = false)
    var attemptNumber: Int = 0,
    @Column(name = "provider", nullable = false, length = 32)
    var provider: String = "UNKNOWN",
    @Column(name = "provider_job_id", length = 160)
    var providerJobId: String? = null,
    @Column(name = "provider_status", nullable = false, length = 32)
    var providerStatus: String = "PENDING",
    @Column(name = "provider_delivery_status", length = 96)
    var providerDeliveryStatus: String? = null,
    @Column(name = "provider_destination_response", length = 1024)
    var providerDestinationResponse: String? = null,
    @Column(name = "provider_event_at")
    var providerEventAt: Instant? = null,
    @Column(name = "provider_checked_at")
    var providerCheckedAt: Instant? = null,
    @Column(name = "tracking_until")
    var trackingUntil: Instant? = null,
    @Column(name = "error_message", length = 1024)
    var errorMessage: String? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
