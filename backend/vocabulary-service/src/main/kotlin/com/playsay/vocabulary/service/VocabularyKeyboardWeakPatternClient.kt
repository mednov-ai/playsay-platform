package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

data class KeyboardWeakPatternEnvelope(val patterns: Map<String, Int> = emptyMap())

@Component
class VocabularyKeyboardWeakPatternClient(
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.keyboard-integration.base-url:http://keyboard-service.playsay-dev.svc.cluster.local}")
    private val keyboardBaseUrl: String,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    private val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()

    fun patterns(ownerSubject: String): Map<String, Int> = runCatching {
        check(serviceToken.isNotBlank()) { "Keyboard integration token is not configured" }
        val encodedSubject = URLEncoder.encode(ownerSubject, StandardCharsets.UTF_8)
        val request = HttpRequest.newBuilder(
            URI.create("${keyboardBaseUrl.trimEnd('/')}/internal/keyboard/weak-patterns/$encodedSubject"),
        )
            .timeout(Duration.ofSeconds(3))
            .header("X-PlaySay-Service-Token", serviceToken)
            .GET()
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        check(response.statusCode() in 200..299) { "Keyboard weak-pattern query failed with HTTP ${response.statusCode()}" }
        objectMapper.readValue<KeyboardWeakPatternEnvelope>(response.body()).patterns
    }.getOrDefault(emptyMap())
}
