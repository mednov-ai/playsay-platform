package com.playsay.email.service

import com.playsay.email.entity.EmailDeliveryAttemptEntity
import com.playsay.email.entity.EmailProviderAttemptEntity
import com.playsay.email.repo.EmailDeliveryAttemptRepo
import com.playsay.email.repo.EmailProviderAttemptRepo
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class TransactionalEmailService(
    private val repo: EmailDeliveryAttemptRepo,
    private val providerAttempts: EmailProviderAttemptRepo,
    private val renderer: TransactionalEmailTemplateRenderer,
    private val sender: OutboundEmailSender,
    private val replayCipher: EmailReplayCipher,
    private val clock: Clock,
    @param:Value("\${playsay.email-service.from-address}") private val fromAddress: String,
    @Value("\${playsay.email-service.delivery-provider:smtp}") deliveryProvider: String,
    @param:Value("\${playsay.email-service.provider-tracking-ttl:PT72H}") private val trackingTtl: Duration,
    @param:Value("\${playsay.email-service.default-replay-ttl:PT72H}") private val defaultReplayTtl: Duration,
) {
    private val configuredProvider = when (deliveryProvider.trim().lowercase()) {
        "unisender-api" -> PROVIDER_UNISENDER
        "mailjet-api" -> PROVIDER_MAILJET
        else -> "SMTP"
    }

    @Transactional(noRollbackFor = [EmailDeliveryProviderException::class])
    fun send(command: TransactionalEmailCommand): TransactionalEmailResult {
        val existing = repo.findLockedByIdempotencyKey(command.idempotencyKey)
        if (existing != null && existing.status != STATUS_FAILED) {
            return existing.result()
        }

        val now = Instant.now(clock)
        val rendered = renderer.render(command)
        val delivery = if (existing == null) {
            repo.saveAndFlush(
                EmailDeliveryAttemptEntity(
                    id = UUID.randomUUID(),
                    idempotencyKey = command.idempotencyKey,
                    toEmail = command.to,
                    templateKey = command.templateKey,
                    locale = command.locale.normalizedLocale(),
                    status = STATUS_PENDING,
                    subject = rendered.subject,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
        } else {
            existing.apply {
                toEmail = command.to
                templateKey = command.templateKey
                locale = command.locale.normalizedLocale()
                status = STATUS_PENDING
                subject = rendered.subject
                errorMessage = null
                updatedAt = now
            }.also(repo::saveAndFlush)
        }

        val payload = ReplayPayload(
            from = fromAddress,
            to = command.to,
            subject = rendered.subject,
            textBody = rendered.textBody,
            htmlBody = rendered.htmlBody,
        )
        storeReplayPayload(delivery, payload, command.replayUntil ?: now.plus(defaultReplayTtl), now)
        return dispatch(delivery, payload, now)
    }

    @Transactional(noRollbackFor = [EmailDeliveryProviderException::class])
    fun resend(deliveryId: UUID): TransactionalEmailResult {
        val delivery = repo.findLockedById(deliveryId) ?: throw EmailDeliveryNotFoundException()
        val now = Instant.now(clock)
        if (!delivery.canResend(now)) {
            throw EmailDeliveryResendNotAllowedException(delivery.resendReason(now))
        }
        val ciphertext = delivery.replayCiphertext ?: throw EmailDeliveryResendNotAllowedException("PAYLOAD_UNAVAILABLE")
        val nonce = delivery.replayNonce ?: throw EmailDeliveryResendNotAllowedException("PAYLOAD_UNAVAILABLE")
        val payload = replayCipher.decrypt(ciphertext, nonce)
        delivery.status = STATUS_PENDING
        delivery.errorMessage = null
        delivery.updatedAt = now
        repo.saveAndFlush(delivery)
        return dispatch(delivery, payload, now)
    }

    private fun dispatch(delivery: EmailDeliveryAttemptEntity, payload: ReplayPayload, now: Instant): TransactionalEmailResult {
        val attemptNumber = delivery.providerAttemptCount + 1
        val providerAttempt = providerAttempts.saveAndFlush(
            EmailProviderAttemptEntity(
                id = UUID.randomUUID(),
                emailDeliveryId = delivery.id,
                attemptNumber = attemptNumber,
                provider = delivery.provider ?: configuredProvider,
                providerStatus = STATUS_PENDING,
                createdAt = now,
                updatedAt = now,
            ),
        )
        delivery.providerAttemptCount = attemptNumber
        repo.saveAndFlush(delivery)

        try {
            val result = sender.send(
                OutboundEmail(
                    from = payload.from,
                    to = payload.to,
                    subject = payload.subject,
                    textBody = payload.textBody,
                    htmlBody = payload.htmlBody,
                    deliveryId = delivery.id,
                    attemptNumber = attemptNumber,
                ),
            )
            val completedAt = Instant.now(clock)
            val trackingUntil = completedAt.plus(trackingTtl).takeIf {
                result.provider == PROVIDER_UNISENDER || result.provider == PROVIDER_MAILJET
            }
            providerAttempt.apply {
                provider = result.provider
                providerJobId = result.providerJobId
                providerStatus = result.providerStatus
                providerDeliveryStatus = result.providerDeliveryStatus
                providerEventAt = completedAt
                providerCheckedAt = completedAt
                this.trackingUntil = trackingUntil
                updatedAt = completedAt
            }.also(providerAttempts::saveAndFlush)
            delivery.apply {
                status = STATUS_SENT
                provider = result.provider
                providerJobId = result.providerJobId
                providerStatus = result.providerStatus
                providerDeliveryStatus = result.providerDeliveryStatus
                providerDestinationResponse = null
                providerEventAt = completedAt
                providerCheckedAt = completedAt
                providerTrackingUntil = trackingUntil
                errorMessage = null
                updatedAt = completedAt
            }.also(repo::saveAndFlush)
            return delivery.result()
        } catch (caught: RuntimeException) {
            val failedAt = Instant.now(clock)
            providerAttempt.apply {
                providerStatus = STATUS_FAILED
                errorMessage = caught.message?.take(1024)
                providerCheckedAt = failedAt
                updatedAt = failedAt
            }.also(providerAttempts::saveAndFlush)
            delivery.apply {
                status = STATUS_FAILED
                provider = providerAttempt.provider
                providerStatus = STATUS_FAILED
                errorMessage = caught.message?.take(1024)
                providerCheckedAt = failedAt
                updatedAt = failedAt
            }.also(repo::saveAndFlush)
            throw EmailDeliveryProviderException(caught)
        }
    }

    private fun storeReplayPayload(
        delivery: EmailDeliveryAttemptEntity,
        payload: ReplayPayload,
        replayUntil: Instant,
        now: Instant,
    ) {
        val encrypted = replayCipher.encrypt(payload)
        delivery.replayCiphertext = encrypted?.ciphertext
        delivery.replayNonce = encrypted?.nonce
        delivery.replayUntil = replayUntil.takeIf { it.isAfter(now) }
        repo.saveAndFlush(delivery)
    }

    private fun EmailDeliveryAttemptEntity.canResend(now: Instant): Boolean =
        replayCipher.available() &&
            replayCiphertext != null &&
            replayNonce != null &&
            replayUntil?.isAfter(now) == true &&
            (status == STATUS_FAILED || providerStatus in RESENDABLE_PROVIDER_STATUSES || trackingExpired(now))

    fun EmailDeliveryAttemptEntity.resendAllowed(now: Instant): Boolean = canResend(now)

    fun EmailDeliveryAttemptEntity.resendReason(now: Instant): String = when {
        !replayCipher.available() || replayCiphertext == null || replayNonce == null -> "PAYLOAD_UNAVAILABLE"
        replayUntil?.isAfter(now) != true -> "PAYLOAD_EXPIRED"
        providerStatus in TERMINAL_PROVIDER_STATUSES -> "TERMINAL_STATUS"
        status == STATUS_FAILED || providerStatus in RESENDABLE_PROVIDER_STATUSES || trackingExpired(now) -> "ALLOWED"
        else -> "DELIVERY_IN_PROGRESS"
    }

    private fun EmailDeliveryAttemptEntity.trackingExpired(now: Instant): Boolean =
        providerStatus !in TERMINAL_PROVIDER_STATUSES && providerTrackingUntil?.isBefore(now) == true

    private fun EmailDeliveryAttemptEntity.result(): TransactionalEmailResult = TransactionalEmailResult(
        status = status,
        deliveryAttemptId = id,
        provider = provider,
        providerStatus = providerStatus,
    )

    private fun String?.normalizedLocale(): String = when (this?.trim()?.lowercase()?.substringBefore("-")) {
        "en" -> "en"
        "de" -> "de"
        "fr" -> "fr"
        else -> "ru"
    }

    companion object {
        const val STATUS_PENDING = "PENDING"
        const val STATUS_SENT = "SENT"
        const val STATUS_FAILED = "FAILED"
        const val PROVIDER_UNISENDER = "UNISENDER_API"
        const val PROVIDER_MAILJET = "MAILJET_API"
        val TERMINAL_PROVIDER_STATUSES = setOf(
            "DELIVERED",
            "OPENED",
            "CLICKED",
            "UNSUBSCRIBED",
            "SUBSCRIBED",
            "HARD_BOUNCED",
            "BLOCKED",
            "SPAM",
            "TRACKING_EXPIRED",
            "NOT_TRACKED",
        )
        val RESENDABLE_PROVIDER_STATUSES = setOf("HARD_BOUNCED", "TRACKING_EXPIRED")
    }
}

internal class EmailDeliveryProviderException(cause: RuntimeException) : RuntimeException(cause.message, cause)
class EmailDeliveryNotFoundException : RuntimeException("Email delivery was not found")
class EmailDeliveryResendNotAllowedException(val reason: String) : RuntimeException("Email delivery cannot be resent: $reason")
