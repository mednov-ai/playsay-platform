package com.playsay.email

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.email.service.MailjetApiOutboundEmailSender
import com.playsay.email.service.OutboundEmail
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.springframework.http.HttpHeaders
import org.springframework.web.client.RestClient

class MailjetApiOutboundEmailSenderTest {
    private var server: HttpServer? = null

    @AfterTest
    fun stopServer() {
        server?.stop(0)
    }

    @Test
    fun `sends a tagged transactional message through Mailjet v3_1`() {
        var capturedBody: String? = null
        var capturedAuthorization: String? = null
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/v3.1/send") { exchange ->
                capturedBody = exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
                capturedAuthorization = exchange.requestHeaders.getFirst(HttpHeaders.AUTHORIZATION)
                val response = """{"Messages":[{"Status":"success","To":[{"Email":"student@example.com","MessageID":123456789}]}]}"""
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, response.toByteArray().size.toLong())
                exchange.responseBody.use { it.write(response.toByteArray()) }
            }
            start()
        }
        val restClient = RestClient.builder()
            .baseUrl("http://127.0.0.1:${server!!.address.port}")
            .defaultHeaders { headers -> headers.setBasicAuth("public-key", "secret-key") }
            .build()
        val sender = MailjetApiOutboundEmailSender(
            restClient = restClient,
            objectMapper = jacksonObjectMapper(),
            fromName = "Honey School",
            environment = "dev",
        )

        val result = sender.send(
            OutboundEmail(
                from = "no-reply@dev.honey.school",
                to = "student@example.com",
                subject = "Confirm your Honey School account",
                textBody = "Confirm your account",
                htmlBody = "<p>Confirm your account</p>",
                deliveryId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
                attemptNumber = 2,
            ),
        )

        assertTrue(capturedAuthorization.orEmpty().startsWith("Basic "))
        val body = requireNotNull(capturedBody)
        assertTrue(body.contains("\"Email\":\"no-reply@dev.honey.school\""))
        assertTrue(body.contains("\"CustomID\":\"00000000-0000-0000-0000-000000000001\""))
        assertTrue(body.contains("\\\"attempt\\\":2"))
        assertTrue(body.contains("\\\"environment\\\":\\\"dev\\\""))
        assertEquals("MAILJET_API", result.provider)
        assertEquals("123456789", result.providerJobId)
        assertEquals("ACCEPTED", result.providerStatus)
    }
}
