package com.playsay.gateway.realtime

import com.playsay.gateway.dto.ChatMessageResponse
import com.playsay.gateway.dto.ChatDeliveryReceiptResponse
import com.playsay.gateway.dto.ChatReadReceiptResponse
import java.util.UUID

data class ChatMessageCreatedEvent(
    val message: ChatMessageResponse,
    val senderSubject: String,
    val recipientSubject: String,
    val recipientUserId: UUID,
)

data class ChatConversationReadEvent(
    val receipt: ChatReadReceiptResponse,
    val participantSubjects: Set<String>,
)

data class ChatMessagesDeliveredEvent(
    val receipt: ChatDeliveryReceiptResponse,
    val senderSubjects: Set<String>,
)
