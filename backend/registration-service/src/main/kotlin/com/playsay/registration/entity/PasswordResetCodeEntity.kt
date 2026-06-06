package com.playsay.registration.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "password_reset_codes")
class PasswordResetCodeEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "email_normalized", nullable = false, length = 320)
    var emailNormalized: String = "",
    @Column(name = "email_original", nullable = false, length = 320)
    var emailOriginal: String = "",
    @Column(name = "display_name", length = 120)
    var displayName: String? = null,
    @Column(name = "locale", nullable = false, length = 16)
    var locale: String = "ru",
    @Column(name = "return_to", length = 1024)
    var returnTo: String? = null,
    @Column(name = "code_hash", nullable = false, length = 64)
    var codeHash: String = "",
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "PENDING",
    @Column(name = "attempts", nullable = false)
    var attempts: Int = 0,
    @Column(name = "requested_at", nullable = false)
    var requestedAt: Instant = Instant.EPOCH,
    @Column(name = "email_sent_at")
    var emailSentAt: Instant? = null,
    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.EPOCH,
    @Column(name = "consumed_at")
    var consumedAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
