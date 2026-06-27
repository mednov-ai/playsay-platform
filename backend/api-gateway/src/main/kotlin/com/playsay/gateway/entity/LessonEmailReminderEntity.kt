package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "lesson_email_reminder")
class LessonEmailReminderEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false)
    var lessonId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lesson_id", nullable = false, insertable = false, updatable = false)
    var lesson: LessonEntity? = null,
    @Column(name = "recipient_user_id", nullable = false)
    var recipientUserId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_user_id", nullable = false, insertable = false, updatable = false)
    var recipientUser: AppUserEntity? = null,
    @Column(name = "recipient_role", nullable = false, length = 32)
    var recipientRole: String = "",
    @Column(name = "reminder_type", nullable = false, length = 64)
    var reminderType: String = "",
    @Column(name = "due_at", nullable = false)
    var dueAt: Instant = Instant.EPOCH,
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "",
    @Column(name = "attempts", nullable = false)
    var attempts: Int = 0,
    @Column(name = "idempotency_key", nullable = false, unique = true, length = 255)
    var idempotencyKey: String = "",
    @Column(name = "last_error")
    var lastError: String? = null,
    @Column(name = "sent_at")
    var sentAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
