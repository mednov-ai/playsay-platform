package com.playsay.gateway.service

import com.playsay.gateway.dto.ChatDeliveryReceiptResponse
import com.playsay.gateway.realtime.ChatMessageCreatedEvent
import com.playsay.gateway.realtime.ChatMessagesDeliveredEvent
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.ChatConversationRepo
import com.playsay.gateway.repo.ChatMessageRepo
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class ChatDeliveryService(
    private val appUserRepo: AppUserRepo,
    private val conversationRepo: ChatConversationRepo,
    private val messageRepo: ChatMessageRepo,
    private val emailDigestService: ChatEmailDigestService,
    private val eventPublisher: ApplicationEventPublisher,
    private val clock: Clock,
) {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun handlePublishedMessage(event: ChatMessageCreatedEvent, delivered: Boolean) {
        val message = messageRepo.findById(event.message.id).orElse(null) ?: return
        if (!delivered) {
            emailDigestService.enqueue(event.recipientUserId, message.id)
            return
        }
        if (message.deliveredAt != null) return
        val deliveredAt = Instant.now(clock)
        message.deliveredAt = deliveredAt
        messageRepo.save(message)
        publishReceipt(
            conversationId = message.conversationId,
            recipientSubject = event.recipientSubject,
            messageIds = listOf(message.id),
            deliveredAt = deliveredAt,
            senderSubjects = setOf(event.senderSubject),
        )
    }

    @Transactional
    fun deliverPending(recipientSubject: String) {
        val recipient = appUserRepo.findByKeycloakSubject(recipientSubject) ?: return
        val pending = messageRepo.findPendingDelivery(recipient.id)
        if (pending.isEmpty()) return
        val deliveredAt = Instant.now(clock)
        pending.forEach { message -> message.deliveredAt = deliveredAt }
        messageRepo.saveAll(pending)

        val sendersById = appUserRepo.findByIdIn(pending.map { message -> message.senderUserId }.distinct())
            .associateBy { user -> user.id }
        pending.groupBy { message -> message.conversationId }.forEach { (conversationId, messages) ->
            val conversation = conversationRepo.findById(conversationId).orElse(null) ?: return@forEach
            val senderSubjects = messages.mapNotNull { message -> sendersById[message.senderUserId]?.keycloakSubject }.toSet()
            if (senderSubjects.isNotEmpty()) {
                publishReceipt(
                    conversationId = conversation.id,
                    recipientSubject = recipientSubject,
                    messageIds = messages.map { message -> message.id },
                    deliveredAt = deliveredAt,
                    senderSubjects = senderSubjects,
                )
            }
        }
    }

    private fun publishReceipt(
        conversationId: UUID,
        recipientSubject: String,
        messageIds: List<UUID>,
        deliveredAt: Instant,
        senderSubjects: Set<String>,
    ) {
        eventPublisher.publishEvent(
            ChatMessagesDeliveredEvent(
                receipt = ChatDeliveryReceiptResponse(
                    conversationId = conversationId,
                    recipientSubject = recipientSubject,
                    messageIds = messageIds,
                    deliveredAt = deliveredAt,
                ),
                senderSubjects = senderSubjects,
            ),
        )
    }
}
