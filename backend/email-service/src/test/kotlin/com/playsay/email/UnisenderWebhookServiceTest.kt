package com.playsay.email

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.email.service.EmailProviderStatusService
import com.playsay.email.service.ProviderDeliveryEvent
import com.playsay.email.service.UnisenderWebhookService
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.HexFormat
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.mockito.Mockito.mock
import org.mockito.Mockito.mockingDetails

class UnisenderWebhookServiceTest {
    private val statusService = mock(EmailProviderStatusService::class.java)
    private val service = UnisenderWebhookService(
        objectMapper = jacksonObjectMapper(),
        statusService = statusService,
        apiKey = "test-api-key",
        userId = 8236338,
    )

    @Test
    fun `valid signed webhook forwards factual provider status`() {
        service.process(signedBody())

        val invocation = mockingDetails(statusService).invocations.single()
        assertEquals("UNISENDER_API", invocation.arguments[0])
        val event = invocation.arguments[1] as ProviderDeliveryEvent
        assertEquals("job-1", event.jobId)
        assertEquals("hard_bounced", event.status)
        assertEquals("err_user_unknown", event.deliveryStatus)
        assertEquals("550 mailbox unavailable", event.destinationResponse)
        assertEquals(Instant.parse("2026-07-19T12:00:00Z"), event.eventAt)
    }

    @Test
    fun `invalid webhook signature is rejected`() {
        assertFailsWith<IllegalArgumentException> {
            service.process(signedBody().replaceFirst(Regex("\\\"auth\\\":\\\"[^\\\"]+"), "\\\"auth\\\":\\\"invalid"))
        }
    }

    private fun signedBody(): String {
        val bodyWithKey = """
            {"auth":"test-api-key","events_by_user":[{"user_id":8236338,"events":[{"event_name":"transactional_email_status","event_data":{"job_id":"job-1","status":"hard_bounced","event_time":"2026-07-19 12:00:00","delivery_info":{"delivery_status":"err_user_unknown","destination_response":"550 mailbox unavailable"}}}]}]}
        """.trimIndent()
        val auth = HexFormat.of().formatHex(
            MessageDigest.getInstance("MD5").digest(bodyWithKey.toByteArray(StandardCharsets.UTF_8)),
        )
        return bodyWithKey.replace("test-api-key", auth)
    }
}
