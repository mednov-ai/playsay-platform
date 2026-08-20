package com.playsay.gateway.service
import com.playsay.gateway.client.HttpPaymentServiceClient
import com.playsay.gateway.client.HttpRegistrationGateway
import com.playsay.gateway.client.HttpYoutubeMediaClient
import com.playsay.gateway.client.EmailDeliveryAdminGateway
import com.playsay.gateway.client.YoutubeVideoCacheRejectedException

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.media.model.YoutubePlaybackQuality
import com.playsay.contract.media.model.YoutubePlaybackSessionRequest
import com.playsay.gateway.dto.ManagedStudentRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.http.HttpClient
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.springframework.http.HttpStatus

class InternalServiceBoundaryCharacterizationTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()

    @Test
    fun `payment webhook preserves path token raw body and nullable response fields`() {
        val rawBody = """ {"event":"payment.succeeded","object":{"id":"pay-1"}} """
        withServer(
            response = HttpFixtureResponse(
                status = 200,
                body = """{"id":"00000000-0000-0000-0000-000000000101","provider":"YOOKASSA","eventType":"payment.succeeded","providerPaymentId":null,"status":"PROCESSED","receivedAt":"2026-08-20T10:00:00Z","processedAt":null}""",
            ),
        ) { baseUrl, requests ->
            val result = HttpPaymentServiceClient(
                baseUrl = baseUrl,
                serviceToken = "payment-token",
                objectMapper = objectMapper,
                httpClient = HttpClient.newHttpClient(),
            ).processYooKassaWebhook(rawBody)

            val request = requests.single()
            assertEquals("POST", request.method)
            assertEquals("/internal/payment-webhooks/yookassa", request.rawPath)
            assertEquals("payment-token", request.header("X-PlaySay-Payment-Service-Token"))
            assertEquals("application/json", request.header("Content-Type"))
            assertEquals(rawBody, request.body)
            assertEquals("YOOKASSA", result.provider)
            assertEquals("PROCESSED", result.status)
            assertNull(result.providerPaymentId)
            assertNull(result.processedAt)
        }
    }

    @Test
    fun `payment client keeps not found and upstream failure mappings`() {
        withServer(
            responder = { request ->
                when (request.rawPath) {
                    "/internal/public/payment-invoices/missing" -> HttpFixtureResponse(404, "{}")
                    else -> HttpFixtureResponse(500, "{}")
                }
            },
        ) { baseUrl, _ ->
            val client = HttpPaymentServiceClient(
                baseUrl = baseUrl,
                serviceToken = "payment-token",
                objectMapper = objectMapper,
                httpClient = HttpClient.newHttpClient(),
            )

            val missing = assertFailsWith<ProjectResponseException> { client.publicInvoice("missing") }
            assertEquals(HttpStatus.NOT_FOUND, missing.statusCode)
            assertEquals(MetaData.ErrorCodes.PAYMENT_INVOICE_NOT_FOUND, missing.errorCode)

            val unavailable = assertFailsWith<ProjectResponseException> { client.listInvoices() }
            assertEquals(HttpStatus.SERVICE_UNAVAILABLE, unavailable.statusCode)
            assertEquals(MetaData.ErrorCodes.PAYMENT_SERVICE_UNAVAILABLE, unavailable.errorCode)
        }
    }

    @Test
    fun `registration client distinguishes public and internal paths and headers`() {
        withServer(
            responder = { request ->
                when (request.rawPath) {
                    "/api/registration/start" -> HttpFixtureResponse(202, """{"status":"PENDING","continueUrl":null}""")
                    "/api/internal/managed-students" -> HttpFixtureResponse(
                        201,
                        """{"subject":"student-1","username":"kid.one","email":null,"firstName":"Kid","lastName":null,"displayName":"Kid"}""",
                    )
                    else -> HttpFixtureResponse(404, "{}")
                }
            },
        ) { baseUrl, requests ->
            val gateway = HttpRegistrationGateway(
                baseUrl = baseUrl,
                serviceToken = "registration-token",
                objectMapper = objectMapper,
                httpClient = HttpClient.newHttpClient(),
            )

            val started = gateway.start(
                StartRegistrationRequest(email = "parent@example.com", password = "password-123"),
                "203.0.113.7",
            )
            val managed = gateway.createManagedStudent(
                ManagedStudentRequest(username = "kid.one", firstName = "Kid"),
            )

            val publicRequest = requests[0]
            assertEquals("/api/registration/start", publicRequest.rawPath)
            assertEquals("203.0.113.7", publicRequest.header("X-Forwarded-For"))
            assertNull(publicRequest.header("X-PlaySay-Service-Token"))
            val publicJson = objectMapper.readTree(publicRequest.body)
            assertEquals("parent@example.com", publicJson.path("email").asText())
            assertTrue(publicJson.has("displayName"))
            assertTrue(publicJson.path("displayName").isNull)
            assertEquals("PENDING", started.status)
            assertNull(started.continueUrl)

            val internalRequest = requests[1]
            assertEquals("/api/internal/managed-students", internalRequest.rawPath)
            assertEquals("registration-token", internalRequest.header("X-PlaySay-Service-Token"))
            val internalJson = objectMapper.readTree(internalRequest.body)
            assertEquals("kid.one", internalJson.path("username").asText())
            assertTrue(internalJson.path("lastName").isNull)
            assertNull(managed.email)
            assertNull(managed.lastName)
        }
    }

    @Test
    fun `email client forwards webhook unchanged and keeps admin not found mapping`() {
        val rawBody = """[{"event":"bounce","email":"learner@example.com"}]"""
        withServer(
            responder = { request ->
                if (request.rawPath.endsWith("/resend")) HttpFixtureResponse(200, "{}")
                else if (request.rawPath.startsWith("/internal/admin/email-deliveries/")) HttpFixtureResponse(404, "{}")
                else HttpFixtureResponse(204, "")
            },
        ) { baseUrl, requests ->
            val gateway = EmailDeliveryAdminGateway(baseUrl, "email-token", objectMapper)

            gateway.forwardMailjetWebhook(rawBody)
            val missing = assertFailsWith<ProjectResponseException> {
                gateway.detail(UUID.fromString("00000000-0000-0000-0000-000000000201"))
            }

            val webhook = requests[0]
            assertEquals("/internal/email-provider/mailjet/webhook", webhook.rawPath)
            assertEquals("email-token", webhook.header("X-PlaySay-Email-Service-Token"))
            assertEquals(rawBody, webhook.body)
            assertEquals(HttpStatus.NOT_FOUND, missing.statusCode)
            assertEquals(MetaData.ErrorCodes.EMAIL_DELIVERY_NOT_FOUND, missing.errorCode)
        }
    }

    @Test
    fun `media client keeps playback rejection mapping and request contract`() {
        withServer(
            response = HttpFixtureResponse(422, """{"code":"YOUTUBE_DURATION_LIMIT_EXCEEDED"}"""),
        ) { baseUrl, requests ->
            val client = HttpYoutubeMediaClient(
                baseUrl = baseUrl,
                serviceToken = "media-token",
                cacheRequestTimeoutSeconds = 660,
                objectMapper = objectMapper,
                httpClient = HttpClient.newHttpClient(),
            )
            val command = YoutubePlaybackSessionRequest(
                subject = "student-1",
                materialId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
                blockId = "video-1",
                videoId = "dQw4w9WgXcQ",
                requestedQuality = YoutubePlaybackQuality.MEDIUM,
                thumbnailStorageKey = null,
                thumbnailSourceUrl = null,
            )

            val rejected = assertFailsWith<YoutubeVideoCacheRejectedException> {
                client.createPlaybackSession(command)
            }

            val request = requests.single()
            assertEquals("/internal/youtube/playback-sessions", request.rawPath)
            assertEquals("media-token", request.header("X-PlaySay-Media-Service-Token"))
            val json = objectMapper.readTree(request.body)
            assertEquals("MEDIUM", json.path("requestedQuality").asText())
            assertTrue(json.path("thumbnailStorageKey").isNull)
            assertEquals("YOUTUBE_DURATION_LIMIT_EXCEEDED", rejected.reason)
        }
    }

    private fun withServer(
        response: HttpFixtureResponse? = null,
        responder: ((CapturedHttpRequest) -> HttpFixtureResponse)? = null,
        test: (String, List<CapturedHttpRequest>) -> Unit,
    ) {
        val requests = CopyOnWriteArrayList<CapturedHttpRequest>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/") { exchange ->
                val captured = CapturedHttpRequest(
                    method = exchange.requestMethod,
                    rawPath = exchange.requestURI.rawPath,
                    rawQuery = exchange.requestURI.rawQuery,
                    headers = exchange.requestHeaders.entries.associate { (name, values) -> name to values.firstOrNull() },
                    body = exchange.requestBody.readBytes().toString(Charsets.UTF_8),
                )
                requests += captured
                val fixtureResponse = responder?.invoke(captured) ?: requireNotNull(response)
                val bytes = fixtureResponse.body.toByteArray()
                exchange.responseHeaders.add("Content-Type", "application/json")
                if (fixtureResponse.status == 204) {
                    exchange.sendResponseHeaders(fixtureResponse.status, -1)
                } else {
                    exchange.sendResponseHeaders(fixtureResponse.status, bytes.size.toLong())
                    exchange.responseBody.use { it.write(bytes) }
                }
                exchange.close()
            }
            start()
        }
        try {
            test("http://127.0.0.1:${server.address.port}", requests)
        } finally {
            server.stop(0)
        }
    }
}

private data class HttpFixtureResponse(val status: Int, val body: String)

private data class CapturedHttpRequest(
    val method: String,
    val rawPath: String,
    val rawQuery: String?,
    val headers: Map<String, String?>,
    val body: String,
) {
    fun header(name: String): String? = headers.entries.firstOrNull { (key) -> key.equals(name, ignoreCase = true) }?.value
}
