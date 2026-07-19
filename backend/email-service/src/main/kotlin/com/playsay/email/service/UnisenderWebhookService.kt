package com.playsay.email.service

import com.fasterxml.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.HexFormat
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service

@Service
class UnisenderWebhookService(
    private val objectMapper: ObjectMapper,
    private val statusService: EmailProviderStatusService,
    @param:Value("\${playsay.email-service.unisender.api-key}") private val apiKey: String,
    @param:Value("\${playsay.email-service.unisender.user-id}") private val userId: Long,
) {
    fun process(rawBody: String) {
        val root = objectMapper.readTree(rawBody)
        val providedAuth = root.path("auth").asText("")
        require(validAuth(rawBody, providedAuth)) { "Invalid Unisender webhook signature" }
        root.path("events_by_user").forEach { eventsByUser ->
            require(eventsByUser.path("user_id").asLong() == userId) { "Unexpected Unisender webhook user" }
            eventsByUser.path("events").forEach { event ->
                if (event.path("event_name").asText() != "transactional_email_status") return@forEach
                val data = event.path("event_data")
                val jobId = data.path("job_id").asText("")
                val status = data.path("status").asText("")
                val eventTime = data.path("event_time").asText("")
                if (jobId.isBlank() || status.isBlank() || eventTime.isBlank()) return@forEach
                val deliveryInfo = data.path("delivery_info")
                statusService.apply(
                    TransactionalEmailService.PROVIDER_UNISENDER,
                    ProviderDeliveryEvent(
                        jobId = jobId,
                        status = status,
                        deliveryStatus = deliveryInfo.path("delivery_status").asText(null),
                        destinationResponse = deliveryInfo.path("destination_response").asText(null),
                        eventAt = EmailProviderStatusService.parseProviderTimestamp(eventTime),
                    ),
                )
            }
        }
    }

    private fun validAuth(rawBody: String, providedAuth: String): Boolean {
        if (apiKey.isBlank() || providedAuth.isBlank()) return false
        val matcher = authPattern.find(rawBody) ?: return false
        val signedBody = rawBody.replaceRange(matcher.groups[2]!!.range, apiKey)
        val expected = HexFormat.of().formatHex(
            MessageDigest.getInstance("MD5").digest(signedBody.toByteArray(StandardCharsets.UTF_8)),
        )
        return MessageDigest.isEqual(
            expected.lowercase().toByteArray(StandardCharsets.US_ASCII),
            providedAuth.lowercase().toByteArray(StandardCharsets.US_ASCII),
        )
    }

    private companion object {
        val authPattern = Regex("(\\\"auth\\\"\\s*:\\s*\\\")(.*?)(\\\")")
    }
}
