package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component

interface ChatEmailClient {
    fun send(command: ChatEmailCommand)
}

data class ChatEmailCommand(
    val to: String,
    val templateKey: String,
    val locale: String?,
    val idempotencyKey: String,
    val model: Map<String, String?>,
    val replayUntil: Instant,
)

private data class ChatEmailResponse(
    val status: String = "",
)

@Component
class HttpChatEmailClient(
    @param:Value("\${playsay.email-service.base-url:http://email-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.email-service.service-token:}")
    private val serviceToken: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build(),
) : ChatEmailClient {
    override fun send(command: ChatEmailCommand) {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create(baseUrl.trimEnd('/') + "/internal/emails/transactional"))
                .timeout(Duration.ofSeconds(20))
                .header(HttpHeaders.ACCEPT, "application/json")
                .header(HttpHeaders.CONTENT_TYPE, "application/json")
                .header("X-PlaySay-Email-Service-Token", requireToken())
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(command)))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        if (response.statusCode() !in 200..299) {
            logger.warn("email-service chat digest rejected status={}", response.statusCode())
            throw IllegalStateException("email-service rejected chat digest")
        }
        val status = runCatching { objectMapper.readValue(response.body(), ChatEmailResponse::class.java).status }
            .getOrDefault("")
        if (status != EMAIL_STATUS_SENT) {
            logger.warn("email-service chat digest returned status={}", status.take(32))
            throw IllegalStateException("email-service did not send chat digest")
        }
    }

    private fun requireToken(): String = serviceToken.takeIf(String::isNotBlank)
        ?: throw IllegalStateException("email-service token is missing")

    private companion object {
        const val EMAIL_STATUS_SENT = "SENT"
        private val logger = LoggerFactory.getLogger(HttpChatEmailClient::class.java)
    }
}
