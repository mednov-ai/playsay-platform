package com.playsay.aitutor.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicReference

class RealtimeCredentialServiceTest {
    private var server: HttpServer? = null

    @AfterEach
    fun tearDown() {
        server?.stop(0)
    }

    @Test
    fun `creates an echo-safe manually triggered realtime session`() {
        val requestBody = AtomicReference<String>()
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/realtime/client_secrets") { exchange ->
                requestBody.set(exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8))
                val response = """{"value":"temporary-secret","expires_at":1893456000}""".toByteArray()
                exchange.sendResponseHeaders(200, response.size.toLong())
                exchange.responseBody.use { it.write(response) }
            }
            start()
        }
        val service = RealtimeCredentialService(
            objectMapper = ObjectMapper(),
            provider = "openai",
            apiKey = "test-key",
            baseUrl = "http://127.0.0.1:${server!!.address.port}",
            model = "realtime-test",
        )

        val credentials = service.create("coral", "Teach a short conversation.")
        val request = ObjectMapper().readTree(requestBody.get())
        val turnDetection = request.at("/session/audio/input/turn_detection")

        assertTrue(credentials.available)
        assertTrue(turnDetection.path("type").asText() == "server_vad")
        assertFalse(turnDetection.path("create_response").asBoolean())
        assertFalse(turnDetection.path("interrupt_response").asBoolean())
        assertTrue(request.at("/session/audio/output/voice").asText() == "coral")
    }
}
