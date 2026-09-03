package com.playsay.gateway.service
import com.playsay.gateway.client.ChatEmailClient
import com.playsay.gateway.client.ChatEmailCommand

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.ChatEmailDigestEntity
import com.playsay.gateway.entity.ChatEmailDigestMessageEntity
import com.playsay.gateway.entity.ChatMessageEntity
import com.playsay.gateway.entity.ChatParticipantStateEntity
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.ChatEmailDigestMessageRepo
import com.playsay.gateway.repo.ChatEmailDigestRepo
import com.playsay.gateway.repo.ChatMessageRepo
import com.playsay.gateway.repo.ChatParticipantStateRepo
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate

@Service
class ChatEmailDigestService(
    private val appUserRepo: AppUserRepo,
    private val digestRepo: ChatEmailDigestRepo,
    private val digestMessageRepo: ChatEmailDigestMessageRepo,
    private val clock: Clock,
    @param:Value("\${playsay.chat-email.initial-delay:PT2M}")
    private val initialDelay: Duration,
    @param:Value("\${playsay.chat-email.cooldown:PT30M}")
    private val cooldown: Duration,
) {
    @Transactional
    fun enqueue(recipientUserId: UUID, messageId: UUID) {
        appUserRepo.lockByIdIn(listOf(recipientUserId))
        if (digestMessageRepo.existsByMessageId(messageId)) return
        val now = Instant.now(clock)
        val digest = digestRepo.findFirstByRecipientUserIdAndStatusInOrderByCreatedAtDesc(
            recipientUserId,
            listOf(STATUS_PENDING),
        )?.takeIf { it.attempts == 0 } ?: createDigest(recipientUserId, now)
        digest.updatedAt = now
        digestRepo.save(digest)
        digestMessageRepo.save(
            ChatEmailDigestMessageEntity(
                id = UUID.randomUUID(),
                digestId = digest.id,
                messageId = messageId,
                createdAt = now,
            ),
        )
    }

    private fun createDigest(recipientUserId: UUID, now: Instant): ChatEmailDigestEntity {
        val cooldownUntil = digestRepo.findFirstByRecipientUserIdAndStatusOrderBySentAtDesc(
            recipientUserId,
            STATUS_SENT,
        )?.sentAt?.plus(cooldown)
        val initialDueAt = now.plus(initialDelay)
        val dueAt = cooldownUntil?.takeIf { it > initialDueAt } ?: initialDueAt
        val id = UUID.randomUUID()
        return digestRepo.saveAndFlush(
            ChatEmailDigestEntity(
                id = id,
                recipientUserId = recipientUserId,
                dueAt = dueAt,
                status = STATUS_PENDING,
                attempts = 0,
                idempotencyKey = "chat-unread-digest:$id",
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    companion object {
        const val STATUS_PENDING = "PENDING"
        const val STATUS_SENT = "SENT"
        const val STATUS_SKIPPED = "SKIPPED"
        const val STATUS_FAILED = "FAILED"
    }
}

@Component
// Explicit dependencies keep each recipient dispatch in its own transaction.
@Suppress("LongParameterList")
class ChatEmailDigestScheduler(
    private val appUserRepo: AppUserRepo,
    private val digestRepo: ChatEmailDigestRepo,
    private val digestMessageRepo: ChatEmailDigestMessageRepo,
    private val messageRepo: ChatMessageRepo,
    private val participantStateRepo: ChatParticipantStateRepo,
    private val emailClient: ChatEmailClient,
    private val clock: Clock,
    @param:Value("\${playsay.public-app-url:https://online.honey.school}")
    private val publicAppUrl: String,
    @Value("\${playsay.chat-email.retry-delays:PT1M,PT5M,PT15M}")
    retryDelaysValue: String,
    transactionManager: PlatformTransactionManager,
    @param:Value("\${playsay.chat-email.cooldown:PT30M}")
    private val cooldown: Duration,
) {
    private val retryDelays = retryDelaysValue.split(',').map { value -> Duration.parse(value.trim()) }
    private val transaction = TransactionTemplate(transactionManager).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }

    @Scheduled(fixedDelayString = "\${playsay.chat-email.poll-delay-ms:30000}")
    fun dispatchDueDigests() {
        dispatchDueDigests(Instant.now(clock))
    }

    fun dispatchDueDigests(now: Instant) {
        digestRepo.findDue(ChatEmailDigestService.STATUS_PENDING, now).forEach { candidate ->
            runCatching { transaction.executeWithoutResult {
                appUserRepo.lockByIdIn(listOf(candidate.recipientUserId))
                val digest = digestRepo.lockById(candidate.id) ?: return@executeWithoutResult
                if (digest.status != ChatEmailDigestService.STATUS_PENDING || digest.dueAt > now) {
                    return@executeWithoutResult
                }
                val cooldownUntil = digestRepo.findFirstByRecipientUserIdAndStatusOrderBySentAtDesc(
                    digest.recipientUserId, ChatEmailDigestService.STATUS_SENT,
                )?.sentAt?.plus(cooldown)
                if (cooldownUntil != null && cooldownUntil > now) {
                    digest.dueAt = cooldownUntil
                    digestRepo.save(digest)
                } else {
                    dispatch(digest, now)
                }
            } }.onFailure { error ->
                logger.warn("chat digest transaction failed errorClass={}", error::class.simpleName)
            }
        }
    }

    private fun dispatch(digest: ChatEmailDigestEntity, now: Instant) {
        val recipient = appUserRepo.findById(digest.recipientUserId).orElse(null)
        if (recipient == null || recipient.deletedAt != null || recipient.email.isNullOrBlank()) {
            skip(digest, now)
            return
        }
        val links = digestMessageRepo.findByDigestIdOrderByCreatedAtAsc(digest.id)
        val messages = messageRepo.findAllById(links.map { link -> link.messageId })
            .filter { message -> message.senderUserId != recipient.id }
        val unread = unreadMessages(recipient.id, messages)
        if (unread.isEmpty()) {
            skip(digest, now)
            return
        }

        val senders = appUserRepo.findByIdIn(unread.map { message -> message.senderUserId }.distinct())
            .sortedBy(::displayName)
        val senderNames = senders.take(MAX_VISIBLE_SENDERS).joinToString(", ", transform = ::displayName)
        val conversationIds = unread.map(ChatMessageEntity::conversationId).distinct()
        val chatTarget = conversationIds.singleOrNull()?.toString() ?: "open"
        val command = ChatEmailCommand(
            to = recipient.email!!.trim(),
            templateKey = TEMPLATE_KEY,
            locale = recipient.locale,
            idempotencyKey = digest.idempotencyKey,
            model = mapOf(
                "displayName" to displayName(recipient),
                "messageCount" to unread.size.toString(),
                "senderNames" to senderNames,
                "additionalSenderCount" to (senders.size - MAX_VISIBLE_SENDERS).coerceAtLeast(0).toString(),
                "chatUrl" to "${publicAppUrl.trimEnd('/')}/?chat=$chatTarget",
            ),
            replayUntil = now.plus(Duration.ofHours(24)),
        )

        digest.attempts += 1
        runCatching { emailClient.send(command) }
            .onSuccess {
                digest.status = ChatEmailDigestService.STATUS_SENT
                digest.sentAt = now
                digest.lastError = null
            }
            .onFailure { error ->
                logger.warn(
                    "chat digest email failed digestId={} recipientUserId={} attempt={} errorClass={}",
                    digest.id,
                    digest.recipientUserId,
                    digest.attempts,
                    error::class.simpleName,
                )
                val retryDelay = retryDelays.getOrNull(digest.attempts - 1)
                if (retryDelay == null) {
                    digest.status = ChatEmailDigestService.STATUS_FAILED
                } else {
                    digest.status = ChatEmailDigestService.STATUS_PENDING
                    digest.dueAt = now.plus(retryDelay)
                }
                digest.lastError = error::class.simpleName
            }
        digest.updatedAt = now
        digestRepo.save(digest)
    }

    private fun unreadMessages(recipientUserId: UUID, messages: List<ChatMessageEntity>): List<ChatMessageEntity> {
        if (messages.isEmpty()) return emptyList()
        val states = participantStateRepo.findByConversationIdInAndUserId(
            messages.map(ChatMessageEntity::conversationId).distinct(),
            recipientUserId,
        ).associateBy(ChatParticipantStateEntity::conversationId)
        val lastReadMessages = messageRepo.findAllById(states.values.mapNotNull(ChatParticipantStateEntity::lastReadMessageId))
            .associateBy(ChatMessageEntity::id)
        return messages.filter { message ->
            val state = states[message.conversationId] ?: return@filter true
            val lastRead = state.lastReadMessageId?.let(lastReadMessages::get)
            when {
                lastRead != null && message.createdAt != lastRead.createdAt -> message.createdAt > lastRead.createdAt
                lastRead != null -> message.id.compareTo(lastRead.id) > 0
                state.readAt != null -> message.createdAt > state.readAt
                else -> true
            }
        }
    }

    private fun skip(digest: ChatEmailDigestEntity, now: Instant) {
        digest.status = ChatEmailDigestService.STATUS_SKIPPED
        digest.lastError = null
        digest.updatedAt = now
        digestRepo.save(digest)
    }

    private fun displayName(user: AppUserEntity): String =
        user.displayName?.trim()?.takeIf(String::isNotEmpty)
            ?: user.name?.trim()?.takeIf(String::isNotEmpty)
            ?: user.username?.trim()?.takeIf(String::isNotEmpty)
            ?: user.keycloakSubject

    private companion object {
        const val TEMPLATE_KEY = "chat-unread-digest"
        const val MAX_VISIBLE_SENDERS = 3
        private val logger = LoggerFactory.getLogger(ChatEmailDigestScheduler::class.java)
    }
}
