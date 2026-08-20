package com.playsay.integration.http

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.http.HttpClient
import java.time.Duration
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class InternalHttpTransportTest {
    @Test
    fun `sends the configured token body and request timeout`() {
        val requests = CopyOnWriteArrayList<CapturedRequest>()
        val server = HttpServer.create(InetSocketAddress(0), 0).apply {
            createContext("/internal/example") { exchange ->
                requests += CapturedRequest(
                    method = exchange.requestMethod,
                    token = exchange.requestHeaders.getFirst("X-Internal-Token"),
                    body = exchange.requestBody.readBytes().toString(Charsets.UTF_8),
                )
                val response = "accepted"
                exchange.sendResponseHeaders(202, response.toByteArray().size.toLong())
                exchange.responseBody.use { it.write(response.toByteArray()) }
            }
            start()
        }
        try {
            val observations = CopyOnWriteArrayList<InternalHttpObservation>()
            val transport = InternalHttpTransport(
                integration = "example-service",
                baseUrl = "http://127.0.0.1:${server.address.port}/",
                serviceTokenHeader = "X-Internal-Token",
                serviceToken = " secret-token ",
                httpClient = HttpClient.newHttpClient(),
                observer = InternalHttpObserver(observations::add),
            )

            val result = transport.exchange(
                method = InternalHttpMethod.POST,
                path = "/internal/example?visible=false",
                body = "{\"value\":1}",
                contentType = "application/json",
                timeout = Duration.ofSeconds(7),
            )

            assertEquals(InternalHttpResponse(202, "accepted"), result)
            assertEquals(CapturedRequest("POST", "secret-token", "{\"value\":1}"), requests.single())
            assertEquals("/internal/example", observations.single().path)
            assertEquals(InternalHttpOutcome.RESPONSE, observations.single().outcome)
            assertEquals(202, observations.single().statusCode)
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun `returns typed configuration failure without sending a request`() {
        val observations = CopyOnWriteArrayList<InternalHttpObservation>()
        val transport = InternalHttpTransport(
            integration = "example-service",
            baseUrl = "http://127.0.0.1:1",
            serviceTokenHeader = "X-Internal-Token",
            serviceToken = " ",
            httpClient = HttpClient.newHttpClient(),
            observer = InternalHttpObserver(observations::add),
        )

        val result = assertIs<InternalHttpConfigurationFailure>(
            transport.exchange(InternalHttpMethod.GET, "/internal/example"),
        )

        assertEquals("service token is missing", result.reason)
        assertEquals(InternalHttpOutcome.CONFIGURATION_FAILURE, observations.single().outcome)
    }

    @Test
    fun `returns typed transport failure for endpoint errors`() {
        val result = InternalHttpTransport(
            integration = "example-service",
            baseUrl = "http://127.0.0.1:1",
            serviceTokenHeader = "X-Internal-Token",
            serviceToken = "token",
            httpClient = HttpClient.newHttpClient(),
        ).exchange(InternalHttpMethod.GET, "/internal/example", timeout = Duration.ofMillis(100))

        assertIs<InternalHttpTransportFailure>(result)
    }

    private data class CapturedRequest(val method: String, val token: String?, val body: String)
}
