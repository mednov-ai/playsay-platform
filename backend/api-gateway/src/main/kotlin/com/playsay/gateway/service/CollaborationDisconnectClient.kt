package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

interface CollaborationDisconnectClient {
    fun disconnect(lessonId: UUID, subject: String): Boolean
}

@Component
class HttpCollaborationDisconnectClient(
    @param:Value("\${playsay.collaboration.http-base-url:http://collaboration-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.collaboration.service-token:}") private val serviceToken: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
) : CollaborationDisconnectClient {
    override fun disconnect(lessonId: UUID, subject: String): Boolean {
        if (serviceToken.isBlank()) return false
        repeat(2) {
            if (disconnectOnce(lessonId, subject)) return true
        }
        return false
    }

    private fun disconnectOnce(lessonId: UUID, subject: String): Boolean {
        val response = runCatching {
            httpClient.send(
                HttpRequest.newBuilder(URI.create("${baseUrl.trimEnd('/')}/internal/disconnect"))
                    .timeout(Duration.ofSeconds(2))
                    .header("Content-Type", "application/json")
                    .header("X-PlaySay-Collaboration-Token", serviceToken)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(mapOf("lessonId" to lessonId, "subject" to subject))))
                    .build(),
                HttpResponse.BodyHandlers.discarding(),
            )
        }.getOrNull() ?: return false
        return response.statusCode() in 200..299
    }
}
