package com.playsay.gateway.service.material

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import org.springframework.stereotype.Component

interface OpenAiResponsesTransport {
    fun createResponse(baseUrl: String, apiKey: String, requestBody: String): String
}

@Component
class JavaOpenAiResponsesTransport : OpenAiResponsesTransport {
    private val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()

    override fun createResponse(baseUrl: String, apiKey: String, requestBody: String): String {
        val request = HttpRequest.newBuilder(URI.create("${baseUrl.trimEnd('/')}/responses"))
            .timeout(Duration.ofSeconds(75))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
        if (response.statusCode() !in 200..299) throw OpenAiTransportException(response.statusCode())
        return response.body()
    }
}

class OpenAiTransportException(val statusCode: Int) : RuntimeException("OpenAI API returned HTTP $statusCode")
