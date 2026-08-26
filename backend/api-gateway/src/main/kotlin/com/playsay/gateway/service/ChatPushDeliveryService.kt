package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.client.ChatWebPushClient
import com.playsay.gateway.client.ChatWebPushCommand
import com.playsay.gateway.client.ChatWebPushResult
import com.playsay.gateway.config.ChatPushProperties
import com.playsay.gateway.entity.ChatMessageEntity
import com.playsay.gateway.entity.ChatParticipantStateEntity
import com.playsay.gateway.entity.ChatPushDeliveryEntity
import com.playsay.gateway.repo.ChatMessageRepo
import com.playsay.gateway.repo.ChatParticipantStateRepo
import com.playsay.gateway.repo.ChatPushDeliveryRepo
import com.playsay.gateway.repo.ChatPushSubscriptionRepo
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import java.time.Clock
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import org.springframework.data.domain.PageRequest
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class ChatPushDeliveryService(
    private val properties: ChatPushProperties,
    private val subscriptions: ChatPushSubscriptionRepo,
    private val deliveries: ChatPushDeliveryRepo,
    private val messageRepository: ChatMessageRepo,
    private val participantStateRepository: ChatParticipantStateRepo,
    private val clock: Clock,
) {
    @Transactional(propagation = Propagation.MANDATORY)
    fun enqueue(message: ChatMessageEntity, recipientUserId: UUID) {
        if (!properties.enabled) return
        val now = Instant.now(clock)
        subscriptions.findByUserIdAndActiveTrue(recipientUserId)
            .asSequence()
            .filter { it.createdAt <= message.createdAt }
            .filterNot { deliveries.existsByMessageIdAndSubscriptionId(message.id, it.id) }
            .map { subscription ->
                ChatPushDeliveryEntity(
                    id = UUID.randomUUID(),
                    messageId = message.id,
                    subscriptionId = subscription.id,
                    status = STATUS_PENDING,
                    attempts = 0,
                    nextAttemptAt = now,
                    createdAt = now,
                    updatedAt = now,
                )
            }
            .toList()
            .takeIf(List<ChatPushDeliveryEntity>::isNotEmpty)
            ?.let(deliveries::saveAll)
    }

    @Transactional
    fun claimNext(): ChatPushDeliveryEntity? {
        val now = Instant.now(clock)
        val id = deliveries.findDueIds(
            statuses = listOf(STATUS_PENDING, STATUS_RETRYING, STATUS_PROCESSING),
            now = now,
            pageable = PageRequest.of(0, 1),
        ).firstOrNull() ?: return null
        val delivery = deliveries.lockById(id) ?: return null
        if (delivery.nextAttemptAt > now || (delivery.leaseUntil?.let { it > now } == true)) return null
        delivery.status = STATUS_PROCESSING
        delivery.leaseUntil = now.plus(properties.lease)
        delivery.updatedAt = now
        return deliveries.saveAndFlush(delivery)
    }

    @Transactional(readOnly = true)
    fun payload(deliveryId: UUID): ClaimedChatPush? {
        val delivery = deliveries.findById(deliveryId).orElse(null) ?: return null
        if (delivery.status != STATUS_PROCESSING) return null
        val subscription = subscriptions.findById(delivery.subscriptionId).orElse(null)
            ?.takeIf { it.active }
            ?: return ClaimedChatPush(delivery, null, null, unread = false)
        val message = messageRepository.findById(delivery.messageId).orElse(null)
            ?: return ClaimedChatPush(delivery, subscription, null, unread = false)
        val state = participantStateRepository.findByConversationIdAndUserId(message.conversationId, subscription.userId)
        return ClaimedChatPush(delivery, subscription, message, isUnread(message, subscription.userId, state))
    }

    @Transactional
    fun skip(deliveryId: UUID) = update(deliveryId) { delivery, now ->
        delivery.status = STATUS_SKIPPED
        delivery.leaseUntil = null
        delivery.updatedAt = now
    }

    @Transactional
    fun sent(deliveryId: UUID) = update(deliveryId) { delivery, now ->
        delivery.status = STATUS_SENT
        delivery.attempts += 1
        delivery.sentAt = now
        delivery.leaseUntil = null
        delivery.lastErrorClass = null
        delivery.updatedAt = now
    }

    @Transactional
    fun permanentFailure(deliveryId: UUID, status: Int) = update(deliveryId) { delivery, now ->
        subscriptions.findById(delivery.subscriptionId).orElse(null)?.let { subscription ->
            subscription.active = false
            subscription.updatedAt = now
            subscriptions.save(subscription)
        }
        delivery.status = STATUS_INVALID
        delivery.attempts += 1
        delivery.leaseUntil = null
        delivery.lastErrorClass = "Http$status"
        delivery.updatedAt = now
    }

    @Transactional
    fun retry(deliveryId: UUID, errorClass: String) = update(deliveryId) { delivery, now ->
        val attempts = delivery.attempts + 1
        delivery.attempts = attempts
        delivery.leaseUntil = null
        delivery.lastErrorClass = errorClass.take(128)
        delivery.updatedAt = now
        if (attempts > properties.parsedRetryDelays.size) {
            delivery.status = STATUS_FAILED
        } else {
            delivery.status = STATUS_RETRYING
            delivery.nextAttemptAt = now.plus(properties.parsedRetryDelays[attempts - 1])
        }
    }

    private fun update(id: UUID, mutation: (ChatPushDeliveryEntity, Instant) -> Unit) {
        val delivery = deliveries.lockById(id) ?: return
        mutation(delivery, Instant.now(clock))
        deliveries.saveAndFlush(delivery)
    }

    private fun isUnread(message: ChatMessageEntity, recipientUserId: UUID, state: ChatParticipantStateEntity?): Boolean {
        if (message.senderUserId == recipientUserId) return false
        val readAt = state?.readAt ?: return true
        if (message.createdAt != readAt) return message.createdAt > readAt
        return state.lastReadMessageId?.let { message.id > it } ?: true
    }

    companion object {
        const val STATUS_PENDING = "PENDING"
        const val STATUS_PROCESSING = "PROCESSING"
        const val STATUS_RETRYING = "RETRYING"
        const val STATUS_SENT = "SENT"
        const val STATUS_SKIPPED = "SKIPPED"
        const val STATUS_INVALID = "INVALID"
        const val STATUS_FAILED = "FAILED"
    }
}

data class ClaimedChatPush(
    val delivery: ChatPushDeliveryEntity,
    val subscription: com.playsay.gateway.entity.ChatPushSubscriptionEntity?,
    val message: ChatMessageEntity?,
    val unread: Boolean,
)

@Component
class ChatPushDeliveryWorker(
    private val properties: ChatPushProperties,
    private val service: ChatPushDeliveryService,
    private val client: ChatWebPushClient,
    private val objectMapper: ObjectMapper,
    private val meterRegistry: MeterRegistry,
    private val deliveries: ChatPushDeliveryRepo,
) {
    private val busy = AtomicBoolean(false)

    init {
        listOf(
            ChatPushDeliveryService.STATUS_PENDING,
            ChatPushDeliveryService.STATUS_RETRYING,
            ChatPushDeliveryService.STATUS_FAILED,
        ).forEach { status ->
            Gauge.builder("playsay.chat.push.deliveries", deliveries) { repository ->
                repository.countByStatus(status).toDouble()
            }.tag("status", status.lowercase()).register(meterRegistry)
        }
    }

    @Scheduled(
        fixedDelayString = "\${playsay.chat-push.poll-delay-ms:3000}",
        initialDelayString = "\${playsay.chat-push.initial-delay-ms:3000}",
    )
    fun dispatchDue() {
        if (!properties.enabled || !busy.compareAndSet(false, true)) return
        try {
            repeat(MAX_BATCH) {
                val claimed = service.claimNext() ?: return
                dispatch(claimed.id)
            }
        } finally {
            busy.set(false)
        }
    }

    private fun dispatch(deliveryId: UUID) {
        val work = service.payload(deliveryId)
        if (work?.subscription == null || work.message == null || !work.unread) {
            service.skip(deliveryId)
            meterRegistry.counter("playsay.chat.push.outcomes", "outcome", "skipped").increment()
            return
        }
        val payload = objectMapper.writeValueAsString(
            mapOf(
                "version" to 1,
                "type" to "chat.message",
                "messageId" to work.message.id,
                "conversationId" to work.message.conversationId,
                "locale" to work.subscription.locale,
                "templateKey" to "chat-new-message",
            ),
        )
        when (val result = client.send(
            ChatWebPushCommand(
                endpoint = work.subscription.endpoint,
                p256dh = work.subscription.p256dh,
                auth = work.subscription.authSecret,
                payload = payload,
            ),
        )) {
            ChatWebPushResult.Success -> {
                service.sent(deliveryId)
                meterRegistry.counter("playsay.chat.push.outcomes", "outcome", "sent").increment()
            }
            is ChatWebPushResult.PermanentFailure -> {
                service.permanentFailure(deliveryId, result.status)
                meterRegistry.counter("playsay.chat.push.outcomes", "outcome", "invalid").increment()
            }
            is ChatWebPushResult.RetryableFailure -> {
                service.retry(deliveryId, result.errorClass)
                meterRegistry.counter("playsay.chat.push.outcomes", "outcome", "retry").increment()
            }
        }
    }

    private companion object {
        const val MAX_BATCH = 20
    }
}
