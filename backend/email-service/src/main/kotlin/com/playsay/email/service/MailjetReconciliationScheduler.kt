package com.playsay.email.service

import com.playsay.email.repo.EmailProviderAttemptRepo
import java.net.URI
import java.time.Clock
import java.time.Instant
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.domain.PageRequest
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["playsay.email-service.delivery-provider"], havingValue = "mailjet-api")
class MailjetReconciliationScheduler(
    private val client: MailjetDeliveryStatusClient,
    private val providerAttempts: EmailProviderAttemptRepo,
    private val statusService: EmailProviderStatusService,
    private val clock: Clock,
    @param:Value("\${playsay.email-service.mailjet.webhook-url:}") private val webhookUrl: String,
    @param:Value("\${playsay.email-service.mailjet.webhook-username:}") private val webhookUsername: String,
    @param:Value("\${playsay.email-service.mailjet.webhook-password:}") private val webhookPassword: String,
) {
    @Scheduled(
        fixedDelayString = "\${playsay.email-service.provider-reconcile-poll-ms:30000}",
        initialDelayString = "\${playsay.email-service.provider-reconcile-initial-delay-ms:30000}",
    )
    fun reconcile() {
        runCatching { reconcileOnce() }
            .onFailure { error -> logger.warn("Mailjet delivery reconciliation failed: {}", error.javaClass.simpleName) }
    }

    @Scheduled(
        fixedDelayString = "\${playsay.email-service.webhook-check-ms:3600000}",
        initialDelayString = "\${playsay.email-service.webhook-check-initial-delay-ms:45000}",
    )
    fun ensureWebhook() {
        if (webhookUrl.isBlank() || webhookUsername.isBlank() || webhookPassword.isBlank()) return
        runCatching { client.ensureWebhooks(authenticatedWebhookUrl()) }
            .onFailure { error -> logger.warn("Mailjet webhook configuration failed: {}", error.javaClass.simpleName) }
    }

    fun reconcileOnce() {
        val now = Instant.now(clock)
        statusService.expireTracking(now)
        providerAttempts.findTrackable(
            provider = TransactionalEmailService.PROVIDER_MAILJET,
            terminalStatuses = TransactionalEmailService.TERMINAL_PROVIDER_STATUSES,
            now = now,
            pageable = PageRequest.of(0, MAX_RECONCILE_BATCH),
        ).forEach { attempt ->
            val messageId = attempt.providerJobId ?: return@forEach
            client.currentEvent(messageId, now)?.let { event ->
                statusService.apply(TransactionalEmailService.PROVIDER_MAILJET, event)
            }
        }
    }

    private fun authenticatedWebhookUrl(): String {
        val plain = URI.create(webhookUrl)
        return URI(
            plain.scheme,
            "$webhookUsername:$webhookPassword",
            plain.host,
            plain.port,
            plain.path,
            plain.query,
            plain.fragment,
        ).toASCIIString()
    }

    private companion object {
        const val MAX_RECONCILE_BATCH = 100
        val logger = LoggerFactory.getLogger(MailjetReconciliationScheduler::class.java)
    }
}
