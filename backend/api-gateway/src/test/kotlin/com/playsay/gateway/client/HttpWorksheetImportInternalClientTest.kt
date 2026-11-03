package com.playsay.gateway.client

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.config.WorksheetImportGatewayProperties
import com.playsay.gateway.dto.WorksheetImportCreateRequest
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.io.OutputStream
import java.time.Duration
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.atomic.AtomicLong
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.springframework.mock.web.MockMultipartFile

class HttpWorksheetImportInternalClientTest {
    @Test
    fun `forwards a twenty MiB image as a bounded multipart request`() {
        val received = AtomicLong()
        val contentType = AtomicReference<String>()
        val server = HttpServer.create(InetSocketAddress(0), 0).apply {
            createContext("/internal/worksheet-imports") { exchange ->
                contentType.set(exchange.requestHeaders.getFirst("Content-Type"))
                received.set(exchange.requestBody.use { it.transferTo(OutputStream.nullOutputStream()) })
                val response = """{"status":"REVIEW_REQUIRED"}""".toByteArray()
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(201, response.size.toLong())
                exchange.responseBody.use { it.write(response) }
            }
            start()
        }
        try {
            val client = HttpWorksheetImportInternalClient(
                properties = WorksheetImportGatewayProperties(
                    enabled = true,
                    baseUrl = "http://127.0.0.1:${server.address.port}",
                    serviceToken = "synthetic-token",
                    connectTimeout = Duration.ofSeconds(5),
                    requestTimeout = Duration.ofSeconds(20),
                ),
                objectMapper = jacksonObjectMapper(),
            )
            val size = 20 * 1024 * 1024
            val image = MockMultipartFile("files", "synthetic.jpg", "image/jpeg", ByteArray(size) { 1 })

            val response = client.create(WorksheetImportCreateRequest("Unit", "en", "A1", "Synthetic"), listOf(image), "synthetic-jwt")

            assertEquals("REVIEW_REQUIRED", response.path("status").asText())
            assertTrue(contentType.get().startsWith("multipart/form-data"))
            assertTrue(received.get() > size && received.get() < size + 1024 * 1024)
        } finally {
            server.stop(0)
        }
    }

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
