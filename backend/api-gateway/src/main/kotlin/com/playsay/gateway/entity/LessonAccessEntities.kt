package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "lesson_access_link")
class LessonAccessLinkEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false)
    var lessonId: UUID = UUID.randomUUID(),
    @Column(name = "token_hash", nullable = false, length = 64, unique = true)
    var tokenHash: String = "",
    @Column(name = "revision", nullable = false)
    var revision: Long = 1,
    @Column(name = "key_version", nullable = false)
    var keyVersion: Int = 1,
    @Column(name = "origin", nullable = false, length = 255)
    var origin: String = "",
    @Column(name = "created_by_subject", nullable = false, length = 255)
    var createdBySubject: String = "",
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "rotated_at")
    var rotatedAt: Instant? = null,
    @Column(name = "revoked_at")
    var revokedAt: Instant? = null,
)

@Entity
@Table(name = "lesson_entry_attempt")
class LessonEntryAttemptEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false)
    var lessonId: UUID = UUID.randomUUID(),
    @Column(name = "link_revision", nullable = false)
    var linkRevision: Long = 1,
    @Column(name = "browser_secret_hash", nullable = false, length = 64)
    var browserSecretHash: String = "",
    @Column(name = "target_subject", length = 255)
    var targetSubject: String? = null,
    @Column(name = "confirmation_method", length = 32)
    var confirmationMethod: String? = null,
    @Column(name = "state", nullable = false, length = 32)
    var state: String = "STARTED",
    @Column(name = "lobby_label", length = 120)
    var lobbyLabel: String? = null,
    @Column(name = "remember_me", nullable = false)
    var rememberMe: Boolean = false,
    @Column(name = "attempt_count", nullable = false)
    var attemptCount: Int = 0,
    @Column(name = "assertion_issued_at")
    var assertionIssuedAt: Instant? = null,
    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.EPOCH,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
    @Version
    @Column(name = "row_version", nullable = false)
    var rowVersion: Long = 0,
)

@Entity
@Table(name = "lesson_email_challenge")
class LessonEmailChallengeEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "attempt_id", nullable = false)
    var attemptId: UUID = UUID.randomUUID(),
    @Column(name = "email_digest", nullable = false, length = 64)
    var emailDigest: String = "",
    @Column(name = "code_hash", nullable = false, length = 64)
    var codeHash: String = "",
    @Column(name = "target_subject", length = 255)
    var targetSubject: String? = null,
    @Column(name = "attempt_count", nullable = false)
    var attemptCount: Int = 0,
    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.EPOCH,
    @Column(name = "consumed_at")
    var consumedAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "lesson_admission")
class LessonAdmissionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false)
    var lessonId: UUID = UUID.randomUUID(),
    @Column(name = "subject", nullable = false, length = 255)
    var subject: String = "",
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "PENDING",
    @Column(name = "admission_method", length = 32)
    var admissionMethod: String? = null,
    @Column(name = "approving_actor_subject", length = 255)
    var approvingActorSubject: String? = null,
    @Column(name = "revision", nullable = false)
    var revision: Long = 1,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
    @Version
    @Column(name = "row_version", nullable = false)
    var rowVersion: Long = 0,
)

@Entity
@Table(name = "lesson_access_audit")
class LessonAccessAuditEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id")
    var lessonId: UUID? = null,
    @Column(name = "event_code", nullable = false, length = 64)
    var eventCode: String = "",
    @Column(name = "outcome", nullable = false, length = 32)
    var outcome: String = "",
    @Column(name = "actor_kind", nullable = false, length = 32)
    var actorKind: String = "ANONYMOUS",
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "lesson_challenge_rate_limit")
class LessonChallengeRateLimitEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "dimension_hash", nullable = false, length = 64)
    var dimensionHash: String = "",
    @Column(name = "window_start", nullable = false)
    var windowStart: Instant = Instant.EPOCH,
    @Column(name = "request_count", nullable = false)
    var requestCount: Int = 0,
    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.EPOCH,
    @Version
    @Column(name = "row_version", nullable = false)
    var rowVersion: Long = 0,
)
