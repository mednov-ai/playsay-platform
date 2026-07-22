package com.playsay.email.service

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import java.time.Instant
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient

class MailjetDeliveryStatusClient(
    private val restClient: RestClient,
) {
    fun currentEvent(messageId: String, checkedAt: Instant): ProviderDeliveryEvent? {
        val response = restClient.get()
            .uri("/v3/REST/message/{messageId}", messageId)
            .accept(MediaType.APPLICATION_JSON)
            .retrieve()
            .body(MailjetMessageResponse::class.java)
        val message = response?.data?.singleOrNull() ?: return null
        val rawStatus = message.status?.trim()?.lowercase() ?: return null
        val normalizedStatus = when (rawStatus) {
            "unknown", "queued" -> "ACCEPTED"
            "sent" -> "DELIVERED"
            "opened" -> "OPENED"
            "clicked" -> "CLICKED"
            "bounce", "bounced", "hardbounced" -> if (message.statePermanent == true) "HARD_BOUNCED" else "SOFT_BOUNCED"
            "softbounced", "deferred" -> "SOFT_BOUNCED"
            "blocked" -> "BLOCKED"
            "spam" -> "SPAM"
            "unsub" -> "UNSUBSCRIBED"
            else -> rawStatus.uppercase()
        }
        return ProviderDeliveryEvent(
            jobId = messageId,
            status = normalizedStatus,
            deliveryStatus = message.stateId?.let { "state_$it" } ?: rawStatus,
            eventAt = checkedAt,
        )
    }

    fun ensureWebhooks(callbackUrl: String) {
        val callbacks = restClient.get()
            .uri("/v3/REST/eventcallbackurl")
            .accept(MediaType.APPLICATION_JSON)
            .retrieve()
            .body(MailjetCallbackResponse::class.java)
            ?.data
            .orEmpty()

        callbackEventTypes.forEach { eventType ->
            val existing = callbacks.firstOrNull { callback ->
                callback.eventType.equals(eventType, ignoreCase = true) && callback.isBackup != true
            }
            val request = MailjetCallbackRequest(
                eventType = eventType,
                url = callbackUrl,
                version = 2,
                isBackup = false,
                status = "alive",
            )
            when {
                existing == null -> restClient.post()
                    .uri("/v3/REST/eventcallbackurl")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity()
                existing.url != callbackUrl || existing.version != 2 || existing.status != "alive" -> restClient.put()
                    .uri("/v3/REST/eventcallbackurl/{id}", requireNotNull(existing.id))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity()
            }
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class MailjetMessageResponse(
        @param:JsonProperty("Data")
        val data: List<MailjetMessage>? = null,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class MailjetMessage(
        @param:JsonProperty("Status")
        val status: String? = null,
        @param:JsonProperty("StatePermanent")
        val statePermanent: Boolean? = null,
        @param:JsonProperty("StateID")
        val stateId: Int? = null,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class MailjetCallbackResponse(
        @param:JsonProperty("Data")
        val data: List<MailjetCallback>? = null,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class MailjetCallback(
        @param:JsonProperty("ID")
        val id: Long? = null,
        @param:JsonProperty("EventType")
        val eventType: String? = null,
        @param:JsonProperty("Url")
        val url: String? = null,
        @param:JsonProperty("Version")
        val version: Int? = null,
        @param:JsonProperty("IsBackup")
        val isBackup: Boolean? = null,
        @param:JsonProperty("Status")
        val status: String? = null,
    )

    private data class MailjetCallbackRequest(
        @param:JsonProperty("EventType")
        val eventType: String,
        @param:JsonProperty("Url")
        val url: String,
        @param:JsonProperty("Version")
        val version: Int,
        @param:JsonProperty("IsBackup")
        val isBackup: Boolean,
        @param:JsonProperty("Status")
        val status: String,
    )

    private companion object {
        val callbackEventTypes = listOf("sent", "open", "click", "bounce", "blocked", "spam", "unsub")
    }
}
