package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.Test
import kotlin.test.assertEquals

class OpenAiLessonTranslationCredentialProviderTest {
    @Test
    fun `creates a translation client secret without exposing the permanent key`() {
        val objectMapper = ObjectMapper()
        val requestBody = AtomicReference<String>()
        val authorization = AtomicReference<String>()
        val safetyIdentifier = AtomicReference<String>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1/realtime/translations/client_secrets") { exchange ->
            requestBody.set(exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8))
            authorization.set(exchange.requestHeaders.getFirst("Authorization"))
            safetyIdentifier.set(exchange.requestHeaders.getFirst("OpenAI-Safety-Identifier"))
            val response = """{"value":"ephemeral-secret","expires_at":1784170800}""".toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, response.size.toLong())
            exchange.responseBody.use { it.write(response) }
        }
        server.start()

        try {
            val provider = OpenAiLessonTranslationCredentialProvider(
                objectMapper = objectMapper,
                enabled = true,
                provider = "openai",
                apiKey = "permanent-secret",
                model = "gpt-realtime-translate",
                baseUrl = "http://127.0.0.1:${server.address.port}/v1",
            )

            val credential = provider.create("fr", "hashed-user-identifier")

            val json = objectMapper.readTree(requestBody.get())
            assertEquals("translation", json.path("session").path("type").asText())
            assertEquals("gpt-realtime-translate", json.path("session").path("model").asText())
            assertEquals("fr", json.path("session").path("audio").path("output").path("language").asText())
            assertEquals("Bearer permanent-secret", authorization.get())
            assertEquals("hashed-user-identifier", safetyIdentifier.get())
            assertEquals("ephemeral-secret", credential.clientSecret)
            assertEquals(Instant.ofEpochSecond(1784170800), credential.expiresAt)
            assertEquals("http://127.0.0.1:${server.address.port}/v1/realtime/translations/calls", credential.callsUrl)
        } finally {
            server.stop(0)
        }
    }
}
