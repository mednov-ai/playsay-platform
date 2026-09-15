package com.playsay.gateway.service

import com.playsay.gateway.client.HtmlGameOptimizerClientException
import com.playsay.gateway.client.MaterialHtmlGameOptimizerClient
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.http.HttpClient
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MaterialHtmlGameOptimizerClientTest {
    @Test
    fun `sends authenticated versioned request and reads aggregate result`() {
        withOptimizerServer(
            200,
            """{"html":"<html>small</html>","policy":"embedded-raster-v1","status":"OPTIMIZED","inputBytes":20,"outputBytes":18,"eligibleCount":1,"replacedCount":1,"bytesSaved":2,"durationMs":4}""",
        ) { baseUrl ->
            val result = client(baseUrl).optimize("<html>large</html>")

            assertEquals("<html>small</html>", result.html)
            assertEquals("embedded-raster-v1", result.policy)
            assertEquals(1, result.replacedCount)
        }
    }

    @Test
    fun `classifies invalid images separately from unavailable and malformed responses`() {
        withOptimizerServer(422, """{"code":"IMAGE_INVALID","retryable":false}""") { baseUrl ->
            assertTrue(assertFailsWith<HtmlGameOptimizerClientException> {
                client(baseUrl).optimize("<html></html>")
            }.invalidImage)
        }
        withOptimizerServer(503, """{"code":"OPTIMIZATION_TIMEOUT","retryable":true}""") { baseUrl ->
            assertFalse(assertFailsWith<HtmlGameOptimizerClientException> {
                client(baseUrl).optimize("<html></html>")
            }.invalidImage)
        }
        withOptimizerServer(200, "not-json") { baseUrl ->
            assertFalse(assertFailsWith<HtmlGameOptimizerClientException> {
                client(baseUrl).optimize("<html></html>")
            }.invalidImage)
        }
    }

    @Test
    fun `missing token fails before network access`() {
        val failure = assertFailsWith<HtmlGameOptimizerClientException> {
            MaterialHtmlGameOptimizerClient("http://127.0.0.1:1", "").optimize("<html></html>")
        }
        assertFalse(failure.invalidImage)
    }

    private fun client(baseUrl: String) = MaterialHtmlGameOptimizerClient(
        baseUrl = baseUrl,
        serviceToken = "test-game-adapter-service-token",
        httpClient = HttpClient.newHttpClient(),
    )

    private fun withOptimizerServer(status: Int, response: String, test: (String) -> Unit) {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/internal/html-game-optimizations") { exchange ->
                assertEquals("POST", exchange.requestMethod)
                assertEquals(
                    "test-game-adapter-service-token",
                    exchange.requestHeaders.getFirst("X-PlaySay-Game-Adapter-Token"),
                )
                val request = exchange.requestBody.readBytes().toString(Charsets.UTF_8)
                assertTrue(request.contains("\"policy\":\"embedded-raster-v1\""))
                assertTrue(request.contains("\"html\""))
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
