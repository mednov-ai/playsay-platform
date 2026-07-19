package com.playsay.email.service

import com.playsay.email.entity.EmailProviderAttemptEntity
import com.playsay.email.repo.EmailDeliveryAttemptRepo
import com.playsay.email.repo.EmailProviderAttemptRepo
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class ProviderDeliveryEvent(
    val jobId: String,
    val status: String,
    val deliveryStatus: String? = null,
    val destinationResponse: String? = null,
    val eventAt: Instant,
)

@Service
class EmailProviderStatusService(
    private val providerAttempts: EmailProviderAttemptRepo,
    private val deliveries: EmailDeliveryAttemptRepo,
    private val clock: Clock,
) {
    @Transactional
    fun apply(provider: String, event: ProviderDeliveryEvent) {
        val attempt = providerAttempts.findByProviderAndProviderJobId(provider, event.jobId) ?: return
        if (attempt.providerEventAt?.isAfter(event.eventAt) == true) return

        val checkedAt = Instant.now(clock)
        val normalizedStatus = event.status.trim().uppercase()
        attempt.applyEvent(normalizedStatus, event, checkedAt)
        providerAttempts.save(attempt)

        val delivery = deliveries.findById(attempt.emailDeliveryId).orElse(null) ?: return
        if (delivery.providerAttemptCount != attempt.attemptNumber) return
        if (delivery.providerEventAt?.isAfter(event.eventAt) == true) return
        delivery.provider = provider
        delivery.providerJobId = attempt.providerJobId
        delivery.providerStatus = normalizedStatus
        delivery.providerDeliveryStatus = event.deliveryStatus
        delivery.providerDestinationResponse = event.destinationResponse?.take(1024)
        delivery.providerEventAt = event.eventAt
        delivery.providerCheckedAt = checkedAt
        if (normalizedStatus in TransactionalEmailService.TERMINAL_PROVIDER_STATUSES) {
            delivery.providerTrackingUntil = null
            attempt.trackingUntil = null
        }
        delivery.updatedAt = checkedAt
        deliveries.save(delivery)
    }

    @Transactional
    fun expireTracking(now: Instant = Instant.now(clock)) {
        providerAttempts.findExpired(TransactionalEmailService.TERMINAL_PROVIDER_STATUSES, now).forEach { attempt ->
            val event = ProviderDeliveryEvent(
                jobId = attempt.providerJobId ?: return@forEach,
                status = "TRACKING_EXPIRED",
                eventAt = now,
            )
            apply(attempt.provider, event)
        }
    }

    private fun EmailProviderAttemptEntity.applyEvent(
        normalizedStatus: String,
        event: ProviderDeliveryEvent,
        checkedAt: Instant,
    ) {
        providerStatus = normalizedStatus
        providerDeliveryStatus = event.deliveryStatus
        providerDestinationResponse = event.destinationResponse?.take(1024)
        providerEventAt = event.eventAt
        providerCheckedAt = checkedAt
        updatedAt = checkedAt
        if (normalizedStatus in TransactionalEmailService.TERMINAL_PROVIDER_STATUSES) trackingUntil = null
    }

    companion object {
        private val providerTimestampFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC)

        fun parseProviderTimestamp(value: String): Instant = Instant.from(providerTimestampFormatter.parse(value))
    }
}
