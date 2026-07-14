package com.playsay.gateway.client

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.http.HttpClient
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class UserDataPurgeClientTest {
    @Test
    fun `purges every personal data service with internal token`() {
        val requests = AtomicInteger()
        val server = HttpServer.create(InetSocketAddress(0), 0).apply {
            createContext("/internal/user-data/student-1") { exchange ->
                assertEquals("DELETE", exchange.requestMethod)
                assertEquals("service-token", exchange.requestHeaders.getFirst("X-PlaySay-Service-Token"))
                requests.incrementAndGet()
                exchange.sendResponseHeaders(204, -1)
                exchange.close()
            }
            start()
        }
        try {
            val baseUrl = "http://127.0.0.1:${server.address.port}"
            HttpUserDataPurgeClient(
                serviceToken = "service-token",
                aiTutorBaseUrl = baseUrl,
                vocabularyBaseUrl = baseUrl,
                keyboardBaseUrl = baseUrl,
                httpClient = HttpClient.newHttpClient(),
            ).purge("student-1")

            assertEquals(3, requests.get())
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun `refuses purge when service token is missing`() {
        val client = HttpUserDataPurgeClient(
            serviceToken = "",
            aiTutorBaseUrl = "http://127.0.0.1",
            vocabularyBaseUrl = "http://127.0.0.1",
            keyboardBaseUrl = "http://127.0.0.1",
        )

        assertFailsWith<IllegalStateException> { client.purge("student-1") }
    }
}
