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
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
