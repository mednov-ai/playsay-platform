package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

data class GameAdapterResult(
    val html: String,
    val report: String,
    val model: String,
    val promptHash: String,
)

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
            throw ProjectResponseException.localized(
                HttpStatus.SERVICE_UNAVAILABLE,
                MetaData.ErrorCodes.GAME_ADAPTER_UNAVAILABLE,
            )
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
            throw ProjectResponseException.localized(
                HttpStatus.BAD_GATEWAY,
                MetaData.ErrorCodes.GAME_ADAPTER_UNAVAILABLE,
            )
        }
        if (response.statusCode() !in 200..299) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_GATEWAY,
                MetaData.ErrorCodes.GAME_ADAPTER_FAILED,
            )
        }
        val json = runCatching { objectMapper.readTree(response.body()) }.getOrNull()
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.GAME_ADAPTER_FAILED)
        val adaptedHtml = json.path("html").asText()
        if (adaptedHtml.isBlank()) {
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.GAME_ADAPTER_FAILED)
        }
        return GameAdapterResult(
            html = adaptedHtml,
            report = json.path("report").asText().take(8_000),
            model = json.path("model").asText().take(120),
            promptHash = json.path("promptHash").asText().take(128),
        )
    }
}
