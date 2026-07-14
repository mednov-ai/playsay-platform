package com.playsay.gateway.client

import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

interface UserDataPurgeClient {
    fun purge(subject: String)
}

@Component
class HttpUserDataPurgeClient(
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
    @param:Value("\${playsay.user-data.ai-tutor-base-url:http://ai-tutor-service.playsay-dev.svc.cluster.local}")
    private val aiTutorBaseUrl: String,
    @param:Value("\${playsay.user-data.vocabulary-base-url:http://vocabulary-service.playsay-dev.svc.cluster.local}")
    private val vocabularyBaseUrl: String,
    @param:Value("\${playsay.user-data.keyboard-base-url:http://keyboard-service.playsay-dev.svc.cluster.local}")
    private val keyboardBaseUrl: String,
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build(),
) : UserDataPurgeClient {
    override fun purge(subject: String) {
        if (serviceToken.isBlank()) error("User-data purge service token is not configured")
        val path = "/internal/user-data/${subject.urlEncoded()}"
        listOf(aiTutorBaseUrl, vocabularyBaseUrl, keyboardBaseUrl).forEach { baseUrl ->
            val endpoint = baseUrl.trimEnd('/') + path
            val request = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofSeconds(20))
                .header(serviceTokenHeader, serviceToken)
                .method(deleteMethod, HttpRequest.BodyPublishers.noBody())
                .build()
            val response = runCatching { httpClient.send(request, HttpResponse.BodyHandlers.discarding()) }
                .getOrElse { exception ->
                    logger.warn("User-data purge request failed endpoint={}", endpoint, exception)
                    error("User-data purge request failed")
                }
            if (response.statusCode() != 204) {
                logger.warn("User-data purge request failed endpoint={} status={}", endpoint, response.statusCode())
                error("User-data purge request failed with status ${response.statusCode()}")
            }
        }
    }

    private companion object {
        private val logger = LoggerFactory.getLogger(HttpUserDataPurgeClient::class.java)
        const val serviceTokenHeader = "X-PlaySay-Service-Token"
        val deleteMethod = "D" + "ELETE"
    }
}

private fun String.urlEncoded(): String = URLEncoder.encode(this, StandardCharsets.UTF_8)
