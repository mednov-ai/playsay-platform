package com.playsay.payment

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.payment.model.PaymentProvider
import com.playsay.contract.payment.model.PaymentProviderEventResponse
import com.playsay.contract.payment.model.PaymentProviderEventStatus
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PaymentBoundarySerializationTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()

    @Test
    fun `provider event keeps json names enum values and nullable fields`() {
        val response = PaymentProviderEventResponse(
            id = UUID.fromString("00000000-0000-0000-0000-000000000401"),
            provider = PaymentProvider.YOOKASSA,
            eventType = "payment.succeeded",
            providerPaymentId = null,
            status = PaymentProviderEventStatus.PROCESSED,
            receivedAt = Instant.parse("2026-08-20T10:00:00Z"),
            processedAt = null,
        )

        val json = objectMapper.readTree(objectMapper.writeValueAsBytes(response))

        assertEquals(
            setOf("id", "provider", "eventType", "providerPaymentId", "status", "receivedAt", "processedAt"),
            json.fieldNames().asSequence().toSet(),
        )
        assertEquals("YOOKASSA", json.path("provider").asText())
        assertEquals("PROCESSED", json.path("status").asText())
        assertTrue(json.path("providerPaymentId").isNull)
        assertTrue(json.path("processedAt").isNull)
    }
}
