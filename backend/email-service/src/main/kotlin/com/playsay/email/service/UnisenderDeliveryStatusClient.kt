package com.playsay.email.service

import com.fasterxml.jackson.databind.JsonNode
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient

data class UnisenderEventDump(val id: String, val status: String, val files: List<String>)

class UnisenderDeliveryStatusClient(
    private val restClient: RestClient,
    private val downloadClient: RestClient,
) {
    fun createDump(start: Instant, end: Instant): String {
        val response = post(
            "/event-dump/create.json",
            mapOf(
                "start_time" to formatter.format(start),
                "end_time" to formatter.format(end),
                "limit" to 100_000,
                "dump_fields" to listOf(
                    "event_time",
                    "job_id",
                    "status",
                    "delivery_status",
                    "destination_response",
                ),
                "delimiter" to ",",
                "format" to "csv",
            ),
        )
        requireSuccess(response)
        return response.path("dump_id").asText().takeIf(String::isNotBlank)
            ?: error("Unisender event dump id is missing")
    }

    fun getDump(id: String): UnisenderEventDump {
        val response = post("/event-dump/get.json", mapOf("dump_id" to id))
        requireSuccess(response)
        val dump = response.path("event_dump")
        return UnisenderEventDump(
            id = id,
            status = dump.path("dump_status").asText("error"),
            files = dump.path("files").mapNotNull { file -> file.path("url").asText().takeIf(String::isNotBlank) },
        )
    }

    fun deleteDump(id: String) {
        requireSuccess(post("/event-dump/delete.json", mapOf("dump_id" to id)))
    }

    fun download(url: String): String = downloadClient.get().uri(url).retrieve().body(String::class.java).orEmpty()

    fun listWebhooks(): JsonNode = post("/webhook/list.json", emptyMap<String, Any>()).also(::requireSuccess)

    fun setWebhook(url: String) {
        requireSuccess(
            post(
                "/webhook/set.json",
                mapOf(
                    "url" to url,
                    "status" to "active",
                    "event_format" to "json_post",
                    "delivery_info" to 1,
                    "single_event" to 0,
                    "max_parallel" to 5,
                    "events" to mapOf(
                        "email_status" to listOf(
                            "delivered",
                            "opened",
                            "clicked",
                            "unsubscribed",
                            "subscribed",
                            "soft_bounced",
                            "hard_bounced",
                            "spam",
                        ),
                    ),
                ),
            ),
        )
    }

    private fun post(path: String, body: Any): JsonNode = restClient.post()
        .uri(path)
        .contentType(MediaType.APPLICATION_JSON)
        .accept(MediaType.APPLICATION_JSON)
        .body(body)
        .retrieve()
        .body(JsonNode::class.java)
        ?: error("Empty Unisender response")

    private fun requireSuccess(response: JsonNode) {
        check(response.path("status").asText() == "success") {
            "Unisender API failed: code=${response.path("code").asText()} message=${response.path("message").asText()}"
        }
    }

    companion object {
        private val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC)
    }
}
