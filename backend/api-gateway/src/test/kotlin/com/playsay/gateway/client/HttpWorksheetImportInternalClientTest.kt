package com.playsay.gateway.client

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.config.WorksheetImportGatewayProperties
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.time.Duration
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HttpWorksheetImportInternalClientTest {
    @Test
    fun `reads JSON through configured object mapper and forwards exact credentials`() {
        val authorization = AtomicReference<String>()
        val serviceToken = AtomicReference<String>()
        val server = HttpServer.create(InetSocketAddress(0), 0).apply {
            createContext("/internal/worksheet-imports") { exchange ->
                authorization.set(exchange.requestHeaders.getFirst("Authorization"))
                serviceToken.set(exchange.requestHeaders.getFirst("X-PlaySay-Worksheet-Service-Token"))
                val response = """{"id":"${UUID.randomUUID()}","status":"REVIEW_REQUIRED","pages":[]}"""
                    .toByteArray()
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, response.size.toLong())
                exchange.responseBody.use { it.write(response) }
            }
            start()
        }

        try {
            val client = HttpWorksheetImportInternalClient(
                properties = WorksheetImportGatewayProperties(
                    enabled = true,
                    baseUrl = "http://127.0.0.1:${server.address.port}",
                    serviceToken = "service-secret",
                    connectTimeout = Duration.ofSeconds(2),
                    requestTimeout = Duration.ofSeconds(2),
                ),
                objectMapper = jacksonObjectMapper(),
            )

            val response = client.get(UUID.randomUUID(), "teacher-jwt")

            assertEquals("REVIEW_REQUIRED", response.path("status").asText())
            assertTrue(response.path("pages").isArray)
            assertEquals("Bearer teacher-jwt", authorization.get())
            assertEquals("service-secret", serviceToken.get())
        } finally {
            server.stop(0)
        }
    }
}
