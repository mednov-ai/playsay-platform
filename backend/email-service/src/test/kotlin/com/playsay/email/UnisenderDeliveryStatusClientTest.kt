package com.playsay.email

import com.playsay.email.service.UnisenderDeliveryStatusClient
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.web.client.RestClient

class UnisenderDeliveryStatusClientTest {
    private var server: HttpServer? = null

    @AfterTest
    fun stopServer() {
        server?.stop(0)
    }

    @Test
    fun `parses webhook list with the Spring Boot 4 Jackson converter`() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/ru/transactional/api/v1/webhook/list.json") { exchange ->
                val response = """{"status":"success","webhooks":[{"url":"https://online.play-and-say.ru/api/webhooks/unisender"}]}"""
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, response.toByteArray(StandardCharsets.UTF_8).size.toLong())
                exchange.responseBody.use { it.write(response.toByteArray(StandardCharsets.UTF_8)) }
            }
            start()
        }
        val client = UnisenderDeliveryStatusClient(
            restClient = RestClient.builder()
                .baseUrl("http://127.0.0.1:${server!!.address.port}/ru/transactional/api/v1")
                .build(),
            downloadClient = RestClient.create(),
        )

        val response = client.listWebhooks()

        assertEquals("success", response.path("status").asText())
        assertEquals(
            "https://online.play-and-say.ru/api/webhooks/unisender",
            response.path("webhooks").path(0).path("url").asText(),
        )
    }
}
