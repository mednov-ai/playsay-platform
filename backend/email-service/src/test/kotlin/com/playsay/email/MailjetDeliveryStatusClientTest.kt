package com.playsay.email

import com.playsay.email.service.MailjetDeliveryStatusClient
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.time.Instant
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.web.client.RestClient

class MailjetDeliveryStatusClientTest {
    private var server: HttpServer? = null

    @AfterTest
    fun stopServer() {
        server?.stop(0)
    }

    @Test
    fun `maps a permanent bounce returned by message reconciliation`() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/v3/REST/message/1002") { exchange ->
                val response = """{"Count":1,"Data":[{"Status":"bounce","StatePermanent":true,"StateID":1}]}"""
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, response.toByteArray().size.toLong())
                exchange.responseBody.use { it.write(response.toByteArray()) }
            }
            start()
        }
        val client = MailjetDeliveryStatusClient(
            RestClient.builder().baseUrl("http://127.0.0.1:${server!!.address.port}").build(),
        )
        val checkedAt = Instant.parse("2026-07-22T12:00:00Z")

        val event = requireNotNull(client.currentEvent("1002", checkedAt))

        assertEquals("HARD_BOUNCED", event.status)
        assertEquals("state_1", event.deliveryStatus)
        assertEquals(checkedAt, event.eventAt)
    }
}
