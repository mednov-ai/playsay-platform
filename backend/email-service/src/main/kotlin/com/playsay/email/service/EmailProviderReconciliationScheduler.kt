package com.playsay.email.service

import com.playsay.email.entity.EmailProviderSyncStateEntity
import com.playsay.email.repo.EmailProviderAttemptRepo
import com.playsay.email.repo.EmailProviderSyncStateRepo
import java.time.Clock
import java.time.Duration
import java.time.Instant
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class EmailProviderReconciliationScheduler(
    private val client: UnisenderDeliveryStatusClient,
    private val providerAttempts: EmailProviderAttemptRepo,
    private val syncStates: EmailProviderSyncStateRepo,
    private val statusService: EmailProviderStatusService,
    private val clock: Clock,
    @param:Value("\${playsay.email-service.unisender.webhook-url:}") private val webhookUrl: String,
    @param:Value("\${playsay.email-service.provider-reconcile-window:PT5M}") private val reconcileWindow: Duration,
    @param:Value("\${playsay.email-service.provider-reconcile-overlap:PT1M}") private val overlap: Duration,
) {
    @Scheduled(
        fixedDelayString = "\${playsay.email-service.provider-reconcile-poll-ms:30000}",
        initialDelayString = "\${playsay.email-service.provider-reconcile-initial-delay-ms:30000}",
    )
    fun reconcile() {
        runCatching { reconcileOnce() }
            .onFailure { error -> logger.warn("Unisender delivery reconciliation failed", error) }
    }

    @Scheduled(
        fixedDelayString = "\${playsay.email-service.webhook-check-ms:3600000}",
        initialDelayString = "\${playsay.email-service.webhook-check-initial-delay-ms:45000}",
    )
    fun ensureWebhook() {
        if (webhookUrl.isBlank()) return
        runCatching {
            val configured = client.listWebhooks().path("objects").any { webhook ->
                webhook.path("url").asText() == webhookUrl && webhook.path("status").asText() == "active"
            }
            if (!configured) client.setWebhook(webhookUrl)
        }.onFailure { error -> logger.warn("Unisender webhook configuration check failed", error) }
    }

    @Transactional
    fun reconcileOnce() {
        val now = Instant.now(clock)
        statusService.expireTracking(now)
        val state = syncStates.findById(PROVIDER).orElseGet {
            EmailProviderSyncStateEntity(
                provider = PROVIDER,
                watermark = now.minus(reconcileWindow),
                updatedAt = now,
            )
        }
        val activeDumpId = state.activeDumpId
        if (activeDumpId != null) {
            consumeActiveDump(state, activeDumpId, now)
            return
        }
        if (!providerAttempts.hasTrackable(PROVIDER, TransactionalEmailService.TERMINAL_PROVIDER_STATUSES, now)) return
        if (state.watermark.plus(reconcileWindow).isAfter(now)) return

        val windowStart = state.watermark.minus(overlap)
        val windowEnd = now
        state.activeDumpId = client.createDump(windowStart, windowEnd)
        state.windowStart = windowStart
        state.windowEnd = windowEnd
        state.dumpCreatedAt = now
        state.updatedAt = now
        syncStates.save(state)
    }

    private fun consumeActiveDump(state: EmailProviderSyncStateEntity, dumpId: String, now: Instant) {
        val dump = client.getDump(dumpId)
        when (dump.status) {
            "ready" -> {
                dump.files.forEach { url -> parseEvents(client.download(url)).forEach { event -> statusService.apply(PROVIDER, event) } }
                client.deleteDump(dumpId)
                state.watermark = state.windowEnd ?: now
                state.clearDump(now)
                syncStates.save(state)
            }
            "failed" -> {
                runCatching { client.deleteDump(dumpId) }
                state.clearDump(now)
                syncStates.save(state)
            }
        }
    }

    private fun parseEvents(csv: String): List<ProviderDeliveryEvent> = csv.lineSequence()
        .drop(1)
        .filter(String::isNotBlank)
        .mapNotNull { line ->
            val columns = parseCsvLine(line)
            if (columns.size < 5 || columns[1].isBlank() || columns[2].isBlank()) return@mapNotNull null
            ProviderDeliveryEvent(
                eventAt = EmailProviderStatusService.parseProviderTimestamp(columns[0]),
                jobId = columns[1],
                status = columns[2],
                deliveryStatus = columns[3].takeIf(String::isNotBlank),
                destinationResponse = columns[4].takeIf(String::isNotBlank),
            )
        }
        .toList()

    private fun parseCsvLine(line: String): List<String> {
        val values = mutableListOf<String>()
        val value = StringBuilder()
        var quoted = false
        var index = 0
        while (index < line.length) {
            val character = line[index]
            when {
                character == '"' && quoted && index + 1 < line.length && line[index + 1] == '"' -> {
                    value.append('"')
                    index++
                }
                character == '"' -> quoted = !quoted
                character == ',' && !quoted -> {
                    values += value.toString()
                    value.clear()
                }
                else -> value.append(character)
            }
            index++
        }
        values += value.toString()
        return values
    }

    private fun EmailProviderSyncStateEntity.clearDump(now: Instant) {
        activeDumpId = null
        windowStart = null
        windowEnd = null
        dumpCreatedAt = null
        updatedAt = now
    }

    private companion object {
        const val PROVIDER = "UNISENDER_API"
        val logger = LoggerFactory.getLogger(EmailProviderReconciliationScheduler::class.java)
    }
}
