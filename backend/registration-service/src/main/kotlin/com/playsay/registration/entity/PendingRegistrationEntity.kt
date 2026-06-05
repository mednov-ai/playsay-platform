package com.playsay.registration.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "pending_registrations")
class PendingRegistrationEntity(
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
    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    var tokenHash: String = "",
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "PENDING",
    @Column(name = "keycloak_created", nullable = false)
    var keycloakCreated: Boolean = false,
    @Column(name = "requested_at", nullable = false)
    var requestedAt: Instant = Instant.EPOCH,
    @Column(name = "email_sent_at")
    var emailSentAt: Instant? = null,
    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.EPOCH,
    @Column(name = "confirmed_at")
    var confirmedAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
