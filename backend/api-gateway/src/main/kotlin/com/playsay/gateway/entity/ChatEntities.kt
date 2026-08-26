package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "chat_conversation")
class ChatConversationEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "teacher_user_id", nullable = false)
    var teacherUserId: UUID = UUID.randomUUID(),
    @Column(name = "student_user_id", nullable = false)
    var studentUserId: UUID = UUID.randomUUID(),
    @Column(name = "last_message_at")
    var lastMessageAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "chat_message")
class ChatMessageEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "conversation_id", nullable = false)
    var conversationId: UUID = UUID.randomUUID(),
    @Column(name = "sender_user_id", nullable = false)
    var senderUserId: UUID = UUID.randomUUID(),
    @Column(name = "client_message_id", nullable = false)
    var clientMessageId: UUID = UUID.randomUUID(),
    @Column(name = "body", nullable = false, length = 4_000)
    var body: String = "",
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "delivered_at")
    var deliveredAt: Instant? = null,
)

@Entity
@Table(name = "chat_participant_state")
class ChatParticipantStateEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "conversation_id", nullable = false)
    var conversationId: UUID = UUID.randomUUID(),
    @Column(name = "user_id", nullable = false)
    var userId: UUID = UUID.randomUUID(),
    @Column(name = "last_read_message_id")
    var lastReadMessageId: UUID? = null,
    @Column(name = "read_at")
    var readAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
    @Column(name = "unread_version", nullable = false)
    var unreadVersion: Long = 0,
)

@Entity
@Table(name = "chat_email_digest")
class ChatEmailDigestEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "recipient_user_id", nullable = false)
    var recipientUserId: UUID = UUID.randomUUID(),
    @Column(name = "due_at", nullable = false)
    var dueAt: Instant = Instant.EPOCH,
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "",
    @Column(name = "attempts", nullable = false)
    var attempts: Int = 0,
    @Column(name = "idempotency_key", nullable = false, unique = true, length = 255)
    var idempotencyKey: String = "",
    @Column(name = "last_error", length = 1024)
    var lastError: String? = null,
    @Column(name = "sent_at")
    var sentAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "chat_email_digest_message")
class ChatEmailDigestMessageEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "digest_id", nullable = false)
    var digestId: UUID = UUID.randomUUID(),
    @Column(name = "message_id", nullable = false, unique = true)
    var messageId: UUID = UUID.randomUUID(),
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "chat_push_subscription")
class ChatPushSubscriptionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "user_id", nullable = false)
    var userId: UUID = UUID.randomUUID(),
    @Column(name = "endpoint", nullable = false, length = 2_048)
    var endpoint: String = "",
    @Column(name = "endpoint_hash", nullable = false, unique = true, length = 64)
    var endpointHash: String = "",
    @Column(name = "p256dh", nullable = false, length = 512)
    var p256dh: String = "",
    @Column(name = "auth_secret", nullable = false, length = 512)
    var authSecret: String = "",
    @Column(name = "locale", nullable = false, length = 16)
    var locale: String = "ru",
    @Column(name = "active", nullable = false)
    var active: Boolean = true,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "chat_push_delivery")
class ChatPushDeliveryEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "message_id", nullable = false)
    var messageId: UUID = UUID.randomUUID(),
    @Column(name = "subscription_id", nullable = false)
    var subscriptionId: UUID = UUID.randomUUID(),
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "PENDING",
    @Column(name = "attempts", nullable = false)
    var attempts: Int = 0,
    @Column(name = "next_attempt_at", nullable = false)
    var nextAttemptAt: Instant = Instant.EPOCH,
    @Column(name = "lease_until")
    var leaseUntil: Instant? = null,
    @Column(name = "last_error_class", length = 128)
    var lastErrorClass: String? = null,
    @Column(name = "sent_at")
    var sentAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
