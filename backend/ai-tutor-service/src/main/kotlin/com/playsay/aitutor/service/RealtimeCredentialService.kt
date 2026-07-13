package com.playsay.aitutor.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.aitutor.dto.RealtimeCredentialsResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant

@Service
class RealtimeCredentialService(
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.ai-tutor.realtime.provider:stub}") private val provider: String,
    @param:Value("\${playsay.ai-tutor.realtime.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.ai-tutor.realtime.base-url:https://api.openai.com/v1}") private val baseUrl: String,
    @param:Value("\${playsay.ai-tutor.realtime.model:gpt-realtime-2.1}") private val model: String,
) {
    private val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build()

    fun create(voice: String, instructions: String): RealtimeCredentialsResponse {
        if (provider != "openai" || apiKey.isBlank()) {
            return RealtimeCredentialsResponse(available = false, model = model, voice = voice)
        }
        val body = objectMapper.writeValueAsString(
            mapOf(
                "session" to mapOf(
                    "type" to "realtime",
                    "model" to model,
                    "instructions" to instructions,
                    "audio" to mapOf(
                        "input" to mapOf(
                            "turn_detection" to mapOf(
                                "type" to "server_vad",
                                "create_response" to false,
                                "interrupt_response" to false,
                            ),
                        ),
                        "output" to mapOf("voice" to voice),
                    ),
                    "tools" to listOf(
                        mapOf(
                            "type" to "function",
                            "name" to "evaluate_learner_turn",
                            "description" to "Evaluate whether the learner answered the current conversation goal clearly and correctly.",
                            "parameters" to mapOf(
                                "type" to "object",
                                "additionalProperties" to false,
                                "required" to listOf("verdict", "goalResult", "original", "improved", "explanation", "category", "encouragement"),
                                "properties" to mapOf(
                                    "verdict" to mapOf("type" to "string", "enum" to listOf("ACCEPTED", "IMPROVE")),
                                    "goalResult" to mapOf("type" to "string", "enum" to listOf("MET", "PARTIAL", "NOT_MET")),
                                    "original" to mapOf("type" to "string"),
                                    "improved" to mapOf("type" to "string"),
                                    "explanation" to mapOf("type" to "string"),
                                    "category" to mapOf("type" to "string", "enum" to listOf("GRAMMAR", "VOCABULARY", "RELEVANCE", "CLARITY")),
                                    "encouragement" to mapOf("type" to "string"),
                                ),
                            ),
                        ),
                    ),
                    "tool_choice" to "auto",
                ),
            ),
        )
        val request = HttpRequest.newBuilder(URI.create("${baseUrl.trimEnd('/')}/realtime/client_secrets"))
            .timeout(Duration.ofSeconds(15))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        check(response.statusCode() in 200..299) { "Realtime client secret request failed (${response.statusCode()})" }
        val json = objectMapper.readTree(response.body())
        val value = json.path("value").asText().ifBlank { json.path("client_secret").path("value").asText() }
        check(value.isNotBlank()) { "Realtime client secret response did not contain a secret" }
        val expiresEpoch = json.path("expires_at").asLong(json.path("client_secret").path("expires_at").asLong(0))
        return RealtimeCredentialsResponse(
            available = true,
            clientSecret = value,
            expiresAt = expiresEpoch.takeIf { it > 0 }?.let(Instant::ofEpochSecond),
            model = model,
            voice = voice,
        )
    }
}
