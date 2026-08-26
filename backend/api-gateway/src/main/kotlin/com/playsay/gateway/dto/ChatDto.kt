package com.playsay.gateway.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant
import java.util.UUID

data class ChatContactResponse(
    val subject: String,
    val displayName: String,
    val role: String,
)

data class CreateChatConversationRequest(
    @field:NotBlank
    val participantSubject: String,
)

data class ChatMessageRequest(
    val clientMessageId: UUID,
    @field:Schema(maxLength = 4_000)
    val text: String,
)

data class MarkChatReadRequest(
    val lastReadMessageId: UUID,
)

data class ChatMessageResponse(
    val id: UUID,
    val conversationId: UUID,
    val senderSubject: String,
    val clientMessageId: UUID,
    val text: String,
    val createdAt: Instant,
    val deliveredAt: Instant? = null,
    val readAt: Instant? = null,
)

data class ChatConversationResponse(
    val id: UUID,
    val counterpart: ChatContactResponse,
    val lastMessage: ChatMessageResponse?,
    val unreadCount: Long,
    val unreadVersion: Long,
    val createdAt: Instant,
)

data class ChatMessagePageResponse(
    val items: List<ChatMessageResponse>,
    val nextCursor: String?,
)

data class ChatReadReceiptResponse(
    val conversationId: UUID,
    val readerSubject: String,
    val lastReadMessageId: UUID,
    val readAt: Instant,
    val unreadCount: Long,
    val unreadVersion: Long,
)

data class ChatUnreadStateResponse(
    val conversationId: UUID,
    val unreadCount: Long,
    val unreadVersion: Long,
    val causeMessageId: UUID? = null,
    val lastReadMessageId: UUID? = null,
)

data class ChatDeliveryReceiptResponse(
    val conversationId: UUID,
    val recipientSubject: String,
    val messageIds: List<UUID>,
    val deliveredAt: Instant,
)

data class ChatPushCapabilityResponse(
    val available: Boolean,
    val publicKey: String? = null,
)

data class ChatPushSubscriptionRequest(
    @field:NotBlank
    @field:Size(max = 2_048)
    val endpoint: String,
    @field:NotBlank
    @field:Size(max = 512)
    val p256dh: String,
    @field:NotBlank
    @field:Size(max = 512)
    val auth: String,
    @field:Pattern(regexp = "(?i)^(ru|en|de|fr)([-_][a-z]{2})?$")
    val locale: String,
)

data class ChatPushSubscriptionResponse(
    val enabled: Boolean,
)

data class ChatPushUnsubscribeRequest(
    @field:NotBlank
    @field:Size(max = 2_048)
    val endpoint: String,
)
