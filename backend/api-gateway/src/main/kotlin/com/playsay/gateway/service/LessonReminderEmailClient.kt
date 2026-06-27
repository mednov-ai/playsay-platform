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
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

interface LessonReminderEmailClient {
    fun send(command: LessonReminderEmailCommand)
}

data class LessonReminderEmailCommand(
    val to: String,
    val templateKey: String,
    val locale: String?,
    val idempotencyKey: String,
    val model: Map<String, String?>,
)

@Component
class HttpLessonReminderEmailClient(
    @param:Value("\${playsay.email-service.base-url:http://email-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.email-service.service-token:}")
    private val serviceToken: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build(),
) : LessonReminderEmailClient {
    override fun send(command: LessonReminderEmailCommand) {
        val body = objectMapper.writeValueAsString(command)
        val response = runCatching {
            httpClient.send(
                HttpRequest.newBuilder(URI.create(baseUrl.trimEnd('/') + "/internal/emails/transactional"))
                    .timeout(Duration.ofSeconds(20))
                    .header(HttpHeaders.ACCEPT, "application/json")
                    .header(HttpHeaders.CONTENT_TYPE, "application/json")
                    .header("X-PlaySay-Email-Service-Token", requireToken())
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build(),
                HttpResponse.BodyHandlers.ofString(),
            )
        }.getOrElse {
            logger.warn("email-service lesson reminder request failed", it)
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.EMAIL_SERVICE_UNAVAILABLE)
        }

        if (response.statusCode() !in 200..299) {
            logger.warn("email-service lesson reminder rejected status={} body={}", response.statusCode(), response.body().take(500))
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.EMAIL_SERVICE_UNAVAILABLE)
        }
    }

    private fun requireToken(): String =
        serviceToken.takeIf { token -> token.isNotBlank() }
            ?: throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.EMAIL_SERVICE_UNAVAILABLE)

    private companion object {
        private val logger = LoggerFactory.getLogger(HttpLessonReminderEmailClient::class.java)
    }
}
