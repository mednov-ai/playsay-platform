package com.playsay.email.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import java.time.Instant
import org.springframework.stereotype.Service

@Service
class MailjetWebhookService(
    private val objectMapper: ObjectMapper,
    private val statusService: EmailProviderStatusService,
) {
    fun process(rawBody: String) {
        val root = objectMapper.readTree(rawBody)
        val events = if (root.isArray) root else objectMapper.createArrayNode().add(root)
        events.forEach(::processEvent)
    }

    private fun processEvent(event: JsonNode) {
        val messageId = event.path("MessageID").asText("").takeIf(String::isNotBlank) ?: return
        val eventName = event.path("event").asText("").trim().lowercase()
        val normalizedStatus = when (eventName) {
            "sent" -> "DELIVERED"
            "open" -> "OPENED"
            "click" -> "CLICKED"
            "bounce" -> if (event.path("hard_bounce").asBoolean(false)) "HARD_BOUNCED" else "SOFT_BOUNCED"
            "blocked" -> "BLOCKED"
            "spam" -> "SPAM"
            "unsub" -> "UNSUBSCRIBED"
            else -> return
        }
        val eventAt = event.path("time").asLong(0).takeIf { it > 0 }?.let(Instant::ofEpochSecond) ?: return
        statusService.apply(
            TransactionalEmailService.PROVIDER_MAILJET,
            ProviderDeliveryEvent(
                jobId = messageId,
                status = normalizedStatus,
                deliveryStatus = event.path("error").asText(null) ?: eventName,
                destinationResponse = event.path("smtp_reply").asText(null) ?: event.path("comment").asText(null),
                eventAt = eventAt,
            ),
        )
    }
}
