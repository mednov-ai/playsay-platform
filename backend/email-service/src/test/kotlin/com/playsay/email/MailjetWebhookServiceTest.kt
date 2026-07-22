package com.playsay.email

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.email.service.EmailProviderStatusService
import com.playsay.email.service.MailjetWebhookService
import com.playsay.email.service.ProviderDeliveryEvent
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import org.mockito.Mockito.mock
import org.mockito.Mockito.mockingDetails

class MailjetWebhookServiceTest {
    private val statusService = mock(EmailProviderStatusService::class.java)
    private val service = MailjetWebhookService(jacksonObjectMapper(), statusService)

    @Test
    fun `maps grouped Mailjet delivery events`() {
        service.process(
            """
            [
              {"event":"sent","time":1784718000,"MessageID":1001,"smtp_reply":"250 OK"},
              {"event":"bounce","time":1784718060,"MessageID":1002,"hard_bounce":true,"error":"user unknown","comment":"550 mailbox unavailable"}
            ]
            """.trimIndent(),
        )

        val invocations = mockingDetails(statusService).invocations.toList()
        assertEquals(2, invocations.size)
        val delivered = invocations[0].arguments[1] as ProviderDeliveryEvent
        assertEquals("MAILJET_API", invocations[0].arguments[0])
        assertEquals("1001", delivered.jobId)
        assertEquals("DELIVERED", delivered.status)
        assertEquals("250 OK", delivered.destinationResponse)
        assertEquals(Instant.ofEpochSecond(1784718000), delivered.eventAt)
        val bounced = invocations[1].arguments[1] as ProviderDeliveryEvent
        assertEquals("HARD_BOUNCED", bounced.status)
        assertEquals("user unknown", bounced.deliveryStatus)
        assertEquals("550 mailbox unavailable", bounced.destinationResponse)
    }

    @Test
    fun `ignores unsupported and uncorrelated events`() {
        service.process("""{"event":"typofix","time":1784718000,"MessageID":1001}""")
        service.process("""{"event":"sent","time":1784718000}""")

        assertEquals(0, mockingDetails(statusService).invocations.size)
    }
}
