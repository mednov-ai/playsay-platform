package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

data class GameAdapterResult(
    val html: String,
    val report: String,
    val model: String,
    val promptHash: String,
)

class GameAdapterClientException(
    val adapterErrorCode: String,
    val retryable: Boolean,
) : RuntimeException(adapterErrorCode)

@Component
class MaterialGameAdapterClient(
    @param:Value("\${playsay.game-adapter-service.base-url:http://game-adapter-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.game-adapter-service.service-token:}") private val serviceToken: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
) {
    fun adapt(html: String): GameAdapterResult {
        val token = serviceToken.trim()
        if (token.isEmpty()) {
            throw GameAdapterClientException(MetaData.ErrorCodes.GAME_ADAPTER_UNAVAILABLE, retryable = true)
        }
        val payload = objectMapper.createObjectNode().put("html", html)
        val request = HttpRequest.newBuilder(
            URI.create(baseUrl.trimEnd('/') + "/internal/game-adaptations"),
        )
            .timeout(Duration.ofMinutes(5))
            .header("Content-Type", "application/json")
            .header("X-PlaySay-Game-Adapter-Token", token)
            .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
            .build()
        val response = runCatching {
            httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        }.getOrElse {
            throw GameAdapterClientException(MetaData.ErrorCodes.GAME_ADAPTER_UNAVAILABLE, retryable = true)
        }
        if (response.statusCode() !in 200..299) {
            val failure = runCatching { objectMapper.readTree(response.body()) }.getOrNull()
            val adapterCode = failure?.path("code")?.asText().orEmpty()
            val retryable = failure?.path("retryable")?.asBoolean(response.statusCode() >= 500)
                ?: (response.statusCode() >= 500)
            throw GameAdapterClientException(mapAdapterError(adapterCode), retryable)
        }
        val json = runCatching { objectMapper.readTree(response.body()) }.getOrNull()
            ?: throw GameAdapterClientException(MetaData.ErrorCodes.GAME_ADAPTER_FAILED, retryable = false)
        val adaptedHtml = json.path("html").asText()
        if (adaptedHtml.isBlank()) {
            throw GameAdapterClientException(MetaData.ErrorCodes.GAME_ADAPTER_FAILED, retryable = false)
        }
        return GameAdapterResult(
            html = adaptedHtml,
            report = json.path("report").asText().take(8_000),
            model = json.path("model").asText().take(120),
            promptHash = json.path("promptHash").asText().take(128),
        )
    }

    private fun mapAdapterError(code: String): String = when (code) {
        "ADAPTED_HTML_CONTRACT_INVALID" -> MetaData.ErrorCodes.GAME_ADAPTER_CONTRACT_INVALID
        "ADAPTED_HTML_RUNTIME_INVALID" -> MetaData.ErrorCodes.GAME_ADAPTER_RUNTIME_INVALID
        "ADAPTED_HTML_ACTION_RATE_EXCEEDED" -> MetaData.ErrorCodes.GAME_ADAPTER_ACTION_RATE_EXCEEDED
        "ADAPTED_HTML_UNSAFE" -> MetaData.ErrorCodes.GAME_ADAPTER_UNSAFE
        "RUNTIME_VALIDATOR_UNAVAILABLE" -> MetaData.ErrorCodes.GAME_ADAPTER_UNAVAILABLE
        else -> MetaData.ErrorCodes.GAME_ADAPTER_FAILED
    }
}
