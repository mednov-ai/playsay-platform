package com.playsay.gateway.realtime

import com.playsay.gateway.service.ChatDeliveryService
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class ChatRealtimeEventListener(
    private val hub: ChatRealtimeHub,
    private val deliveryService: ChatDeliveryService,
) {
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onMessageCreated(event: ChatMessageCreatedEvent) {
        deliveryService.handlePublishedMessage(event, hub.publish(event))
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onConversationRead(event: ChatConversationReadEvent) = hub.publish(event)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onUnreadChanged(event: ChatUnreadChangedEvent) = hub.publish(event)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onMessagesDelivered(event: ChatMessagesDeliveredEvent) = hub.publish(event)
}
