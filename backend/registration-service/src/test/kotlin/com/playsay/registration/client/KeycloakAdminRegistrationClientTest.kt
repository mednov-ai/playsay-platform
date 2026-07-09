package com.playsay.registration.client

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.registration.service.KeycloakUserCreateCommand
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.http.HttpClient
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class KeycloakAdminRegistrationClientTest {
    @Test
    fun `managed student create payload completes required keycloak profile`() {
        val objectMapper = jacksonObjectMapper()
        val requests = mutableListOf<CapturedRequest>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            requests += CapturedRequest(exchange.requestMethod, exchange.requestURI.path, exchange.requestBody.readBytes().toString(Charsets.UTF_8))
            when {
                exchange.requestURI.path.endsWith("/protocol/openid-connect/token") ->
                    exchange.respondJson(200, """{"access_token":"admin-token"}""")
                exchange.requestMethod == "POST" && exchange.requestURI.path.endsWith("/admin/realms/playsay/users") ->
                    exchange.respondJson(201, "")
                else ->
                    exchange.respondJson(404, """{"error":"not-found"}""")
            }
        }
        server.start()

        try {
            val client = KeycloakAdminRegistrationClient(
                httpClient = HttpClient.newHttpClient(),
                objectMapper = objectMapper,
                keycloakBaseUrl = "http://127.0.0.1:${server.address.port}/keycloak",
                realm = "playsay",
                clientId = "playsay-registration-service",
                clientSecret = "secret",
            )

            val created = client.createDisabledUser(
                KeycloakUserCreateCommand(
                    email = "managed@example.com",
                    password = "Aa1!managed",
                    displayName = "Managed Student",
                    enabled = true,
                    emailVerified = true,
                    managedStudent = true,
                ),
            )

            val createBody = objectMapper.readTree(requests.single { it.path.endsWith("/admin/realms/playsay/users") }.body)
            assertTrue(created)
            assertEquals("Managed", createBody.get("firstName").asText())
            assertEquals("Student", createBody.get("lastName").asText())
            assertTrue(createBody.get("requiredActions").isArray)
            assertEquals(0, createBody.get("requiredActions").size())
            assertFalse(createBody.get("credentials").single().get("temporary").asBoolean())
            assertEquals("true", createBody.get("attributes").get("playsay_managed_student").single().asText())
        } finally {
            server.stop(0)
        }
    }

    private data class CapturedRequest(
        val method: String,
        val path: String,
        val body: String,
    )

    private fun HttpExchange.respondJson(status: Int, body: String) {
        val payload = body.toByteArray(Charsets.UTF_8)
        responseHeaders.add("content-type", "application/json")
        sendResponseHeaders(status, payload.size.toLong())
        responseBody.use { output -> output.write(payload) }
    }
}
