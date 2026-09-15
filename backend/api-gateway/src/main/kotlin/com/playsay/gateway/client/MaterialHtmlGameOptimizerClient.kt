package com.playsay.gateway.client

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.HtmlGameOptimizationResult
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

class HtmlGameOptimizerClientException(
    val invalidImage: Boolean,
) : RuntimeException(if (invalidImage) "IMAGE_INVALID" else "OPTIMIZER_UNAVAILABLE")

@Component
class MaterialHtmlGameOptimizerClient(
    @param:Value("\${playsay.game-adapter-service.base-url:http://game-adapter-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.game-adapter-service.service-token:}") private val serviceToken: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
) {
    fun optimize(html: String): HtmlGameOptimizationResult {
        val token = serviceToken.trim()
        if (token.isEmpty()) throw HtmlGameOptimizerClientException(invalidImage = false)
        val payload = objectMapper.createObjectNode()
            .put("html", html)
            .put("policy", HTML_GAME_IMAGE_OPTIMIZATION_POLICY)
        val request = HttpRequest.newBuilder(
            URI.create(baseUrl.trimEnd('/') + "/internal/html-game-optimizations"),
        )
            .timeout(Duration.ofSeconds(30))
            .header("Content-Type", "application/json")
            .header("X-PlaySay-Game-Adapter-Token", token)
            .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
            .build()
        val response = runCatching { httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream()) }
            .getOrElse { throw HtmlGameOptimizerClientException(invalidImage = false) }
        val responseBytes = runCatching {
            response.body().use { body -> body.readNBytes(maxResponseBytes + 1) }
        }.getOrElse { throw HtmlGameOptimizerClientException(invalidImage = false) }
        if (responseBytes.size > maxResponseBytes) throw HtmlGameOptimizerClientException(invalidImage = false)
        val responseBody = responseBytes.toString(Charsets.UTF_8)
        if (response.statusCode() !in 200..299) {
            val code = runCatching { objectMapper.readTree(responseBody).path("code").asText() }.getOrDefault("")
            throw HtmlGameOptimizerClientException(
                invalidImage = response.statusCode() == 422 && code in setOf("IMAGE_INVALID", "IMAGE_LIMIT_EXCEEDED"),
            )
        }
        return runCatching {
            objectMapper.readValue(responseBody, HtmlGameOptimizationResult::class.java)
        }.getOrElse { throw HtmlGameOptimizerClientException(invalidImage = false) }
    }

    private companion object {
        const val maxResponseBytes = 24 * 1024 * 1024
    }
}

const val HTML_GAME_IMAGE_OPTIMIZATION_POLICY = "embedded-raster-v1"
