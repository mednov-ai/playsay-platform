package com.playsay.email

import com.playsay.email.service.OutboundEmail
import com.playsay.email.service.UnisenderApiOutboundEmailSender
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertTrue
import org.springframework.web.client.RestClient

class UnisenderApiOutboundEmailSenderTest {
    private var server: HttpServer? = null

    @AfterTest
    fun stopServer() {
        server?.stop(0)
    }

    @Test
    fun `sends email through Unisender Go web api`() {
        var capturedBody: String? = null
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/ru/transactional/api/v1/email/send.json") { exchange ->
                capturedBody = exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
                val response = """{"status":"success","job_id":"job-1","emails":["student@example.com"],"tags":[]}"""
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, response.toByteArray(StandardCharsets.UTF_8).size.toLong())
                exchange.responseBody.use { it.write(response.toByteArray(StandardCharsets.UTF_8)) }
            }
            start()
        }
        val port = server!!.address.port
        val sender = UnisenderApiOutboundEmailSender(
            restClient = RestClient.builder()
                .baseUrl("http://127.0.0.1:$port/ru/transactional/api/v1")
                .build(),
            apiKey = "test-api-key",
            userId = 8236338,
            fromName = "Play&Say",
        )

        sender.send(
            OutboundEmail(
                from = "no-reply@play-and-say.ru",
                to = "student@example.com",
                subject = "Confirm your Play&Say account",
                textBody = "Hello!\nConfirm here: https://online.play-and-say.ru/register/confirm?token=token-1",
                htmlBody = "<p>Hello!</p><p><a href=\"https://online.play-and-say.ru/register/confirm?token=token-1\">Confirm email</a></p>",
                deliveryId = java.util.UUID.fromString("00000000-0000-0000-0000-000000000001"),
                attemptNumber = 1,
            ),
        )

        val body = requireNotNull(capturedBody)
        assertTrue(body.contains(""""api_key":"test-api-key""""))
        assertTrue(body.contains(""""user_id":8236338"""))
        assertTrue(body.contains(""""from_email":"no-reply@play-and-say.ru""""))
        assertTrue(body.contains(""""from_name":"Play&Say""""))
        assertTrue(body.contains(""""email":"student@example.com""""))
        assertTrue(body.contains(""""template_engine":"velocity""""))
        assertTrue(body.contains(""""plaintext":"Hello!\nConfirm here: https://online.play-and-say.ru/register/confirm?token=token-1""""))
        assertTrue(body.contains(""""html":"<p>Hello!</p><p><a href=\"https://online.play-and-say.ru/register/confirm?token=token-1\">Confirm email</a></p>""""))
    }
}
