package com.playsay.registration.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "managed_student_invites")
class ManagedStudentInviteEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    var tokenHash: String = "",
    @Column(name = "keycloak_subject", nullable = false, length = 255)
    var keycloakSubject: String = "",
    @Column(name = "email_normalized", nullable = false, length = 320)
    var emailNormalized: String = "",
    @Column(name = "display_name", length = 120)
    var displayName: String? = null,
    @Column(name = "lesson_id", nullable = false)
    var lessonId: UUID = UUID.randomUUID(),
    @Column(name = "continue_url", nullable = false, length = 1024)
    var continueUrl: String = "",
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "PENDING",
    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.EPOCH,
    @Column(name = "consumed_at")
    var consumedAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
