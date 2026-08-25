package com.playsay.openai

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

interface OpenAiResponsesTransport {
    fun createResponse(baseUrl: String, apiKey: String, requestBody: String): String

    fun createBoundedResponse(
        baseUrl: String,
        apiKey: String,
        requestBody: String,
        timeout: Duration,
        maxResponseBytes: Int,
    ): String = createResponse(baseUrl, apiKey, requestBody).also { response ->
        if (response.toByteArray(StandardCharsets.UTF_8).size > maxResponseBytes) throw OpenAiResponseTooLargeException()
    }
}

open class JavaOpenAiResponsesTransport : OpenAiResponsesTransport {
    private val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()

    override fun createResponse(baseUrl: String, apiKey: String, requestBody: String): String =
        createBoundedResponse(baseUrl, apiKey, requestBody, Duration.ofSeconds(75), 8 * 1024 * 1024)

    override fun createBoundedResponse(
        baseUrl: String,
        apiKey: String,
        requestBody: String,
        timeout: Duration,
        maxResponseBytes: Int,
    ): String {
        val request = HttpRequest.newBuilder(URI.create("${baseUrl.trimEnd('/')}/responses"))
            .timeout(timeout)
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream())
        response.body().use { input ->
            if (response.statusCode() !in 200..299) throw OpenAiTransportException(response.statusCode())
            val bytes = input.readNBytes(maxResponseBytes + 1)
            if (bytes.size > maxResponseBytes) throw OpenAiResponseTooLargeException()
            return bytes.toString(StandardCharsets.UTF_8)
        }
    }
}

class OpenAiTransportException(val statusCode: Int) : RuntimeException("OpenAI API returned HTTP $statusCode")
class OpenAiResponseTooLargeException : RuntimeException("OpenAI API response exceeded its configured bound")
