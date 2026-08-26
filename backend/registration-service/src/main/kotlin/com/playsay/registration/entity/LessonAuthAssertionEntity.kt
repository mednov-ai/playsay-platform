package com.playsay.registration.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "lesson_auth_assertion")
@Suppress("LongParameterList")
class LessonAuthAssertionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "handle_hash", nullable = false, unique = true, length = 64)
    var handleHash: String = "",
    @Column(name = "subject", nullable = false, length = 255)
    var subject: String = "",
    @Column(name = "browser_attempt_id", nullable = false)
    var browserAttemptId: UUID = UUID.randomUUID(),
    @Column(name = "client_id", nullable = false, length = 128)
    var clientId: String = "",
    @Column(name = "issuer", nullable = false, length = 512)
    var issuer: String = "",
    @Column(name = "callback", nullable = false, length = 1024)
    var callback: String = "",
    @Column(name = "remember_me", nullable = false)
    var rememberMe: Boolean = false,
    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.EPOCH,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "redeemed_at")
    var redeemedAt: Instant? = null,
    @Version
    @Column(name = "row_version", nullable = false)
    var rowVersion: Long = 0,
)
