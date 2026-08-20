package com.playsay.gateway.client

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.email.model.TransactionalEmailRequest
import com.playsay.contract.email.model.TransactionalEmailResponse
import com.playsay.integration.http.InternalHttpFailure
import com.playsay.integration.http.InternalHttpMethod
import com.playsay.integration.http.InternalHttpResponse
import com.playsay.integration.http.InternalHttpTransport
import java.net.http.HttpClient
import java.time.Duration
import java.time.Instant
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
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
    private val transport = InternalHttpTransport(
        integration = "email-service",
        baseUrl = baseUrl,
        serviceTokenHeader = "X-PlaySay-Email-Service-Token",
        serviceToken = serviceToken,
        httpClient = httpClient,
    )

    override fun send(command: ChatEmailCommand) {
        val payload = TransactionalEmailRequest(
            to = command.to,
            templateKey = command.templateKey,
            idempotencyKey = command.idempotencyKey,
            locale = command.locale,
            model = command.model,
            replayUntil = command.replayUntil,
        )
        val response = when (
            val result = transport.exchange(
                method = InternalHttpMethod.POST,
                path = "/internal/emails/transactional",
                body = objectMapper.writeValueAsString(payload),
                contentType = "application/json",
                timeout = Duration.ofSeconds(20),
            )
        ) {
            is InternalHttpResponse -> result
            is InternalHttpFailure -> throw IllegalStateException("email-service request failed: ${result::class.simpleName}")
        }
        if (response.statusCode !in 200..299) {
            logger.warn("email-service chat digest rejected status={}", response.statusCode)
            throw IllegalStateException("email-service rejected chat digest")
        }
        val status = runCatching { objectMapper.readValue(response.body, TransactionalEmailResponse::class.java).status }
            .getOrDefault("")
        if (status != EMAIL_STATUS_SENT) {
            logger.warn("email-service chat digest returned status={}", status.take(32))
            throw IllegalStateException("email-service did not send chat digest")
        }
    }

    private companion object {
        const val EMAIL_STATUS_SENT = "SENT"
        private val logger = LoggerFactory.getLogger(HttpChatEmailClient::class.java)
    }
}
