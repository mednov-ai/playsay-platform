package com.playsay.gateway.service

import com.playsay.gateway.utils.MetaData
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.http.HttpClient
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class MaterialGameAdapterClientTest {
    @Test
    fun `returns validated adapter response and sends internal token`() {
        withAdapterServer(
            status = 200,
            response = """{"html":"<html>adapted</html>","report":"validated","model":"gpt-test","promptHash":"abc"}""",
        ) { baseUrl ->
            val result = client(baseUrl).adapt("<html>source</html>")

            assertEquals("<html>adapted</html>", result.html)
            assertEquals("validated", result.report)
            assertEquals("gpt-test", result.model)
            assertEquals("abc", result.promptHash)
        }
    }

    @Test
    fun `maps contract rejection to terminal localized error`() {
        withAdapterServer(
            status = 422,
            response = """{"code":"ADAPTED_HTML_CONTRACT_INVALID","retryable":false}""",
        ) { baseUrl ->
            val failure = assertFailsWith<GameAdapterClientException> {
                client(baseUrl).adapt("<html>source</html>")
            }

            assertEquals(MetaData.ErrorCodes.GAME_ADAPTER_CONTRACT_INVALID, failure.adapterErrorCode)
            assertEquals(false, failure.retryable)
        }
    }

    @Test
    fun `maps unavailable runtime validator to retryable service error`() {
        withAdapterServer(
            status = 503,
            response = """{"code":"RUNTIME_VALIDATOR_UNAVAILABLE","retryable":true}""",
        ) { baseUrl ->
            val failure = assertFailsWith<GameAdapterClientException> {
                client(baseUrl).adapt("<html>source</html>")
            }

            assertEquals(MetaData.ErrorCodes.GAME_ADAPTER_UNAVAILABLE, failure.adapterErrorCode)
            assertTrue(failure.retryable)
        }
    }

    @Test
    fun `missing service token is retryable without making a request`() {
        val failure = assertFailsWith<GameAdapterClientException> {
            MaterialGameAdapterClient(
                baseUrl = "http://127.0.0.1:1",
                serviceToken = "",
            ).adapt("<html>source</html>")
        }

        assertEquals(MetaData.ErrorCodes.GAME_ADAPTER_UNAVAILABLE, failure.adapterErrorCode)
        assertTrue(failure.retryable)
    }

    private fun client(baseUrl: String) = MaterialGameAdapterClient(
        baseUrl = baseUrl,
        serviceToken = "test-game-adapter-service-token",
        httpClient = HttpClient.newHttpClient(),
    )

    private fun withAdapterServer(status: Int, response: String, test: (String) -> Unit) {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/internal/game-adaptations") { exchange ->
                assertEquals("POST", exchange.requestMethod)
                assertEquals(
                    "test-game-adapter-service-token",
                    exchange.requestHeaders.getFirst("X-PlaySay-Game-Adapter-Token"),
                )
                assertTrue(exchange.requestBody.readBytes().toString(Charsets.UTF_8).contains("\"html\""))
                val body = response.toByteArray()
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(status, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            }
            start()
        }
        try {
            test("http://127.0.0.1:${server.address.port}")
        } finally {
            server.stop(0)
        }
    }
}
