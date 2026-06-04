package com.playsay.payment

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.payment.dto.PaymentProviderHttpRequest
import com.playsay.payment.dto.PaymentProviderHttpResponse
import com.playsay.payment.service.PaymentAttemptStatus
import com.playsay.payment.service.PaymentProviderHttpClient
import com.playsay.payment.service.ProviderPaymentCreateCommand
import com.playsay.payment.service.YooKassaPaymentProviderClient
import java.util.Base64
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

class YooKassaPaymentProviderClientTest {
    private val objectMapper = jacksonObjectMapper()

    @Test
    fun `create payment sends YooKassa request with basic auth idempotence key and metadata`() {
        val httpClient = RecordingPaymentProviderHttpClient(
            postResponse = """
                {
                  "id": "pay-1",
                  "status": "pending",
                  "confirmation": {
                    "confirmation_url": "https://yookassa.test/checkout/pay-1"
                  }
                }
            """.trimIndent(),
        )
        val invoiceId = UUID.randomUUID()
        val paymentAttemptId = UUID.randomUUID()
        val client = YooKassaPaymentProviderClient(
            apiUrl = "https://api.yookassa.test/v3",
            shopId = "123456",
            secretKey = "test_secret",
            httpClient = httpClient,
        )

        val result = client.createPayment(
            ProviderPaymentCreateCommand(
                invoiceId = invoiceId,
                amountMinor = 350_000,
                currency = "RUB",
                description = "Play&Say lesson package",
                returnUrl = "https://online.play-and-say.ru/pay/token",
                idempotenceKey = "idem-1",
                metadata = mapOf(
                    "invoiceId" to invoiceId.toString(),
                    "paymentAttemptId" to paymentAttemptId.toString(),
                ),
            ),
        )

        assertEquals("pay-1", result.providerPaymentId)
        assertEquals("https://yookassa.test/checkout/pay-1", result.confirmationUrl)
        assertEquals(PaymentAttemptStatus.WAITING_FOR_CONFIRMATION, result.status)

        val request = httpClient.requests.single()
        assertEquals("POST", request.method)
        assertEquals("https://api.yookassa.test/v3/payments", request.url)
        assertEquals("Basic ${Base64.getEncoder().encodeToString("123456:test_secret".toByteArray())}", request.headers["Authorization"])
        assertEquals("idem-1", request.headers["Idempotence-Key"])
        val json = objectMapper.readTree(request.body)
        assertEquals("3500.00", json.path("amount").path("value").asText())
        assertEquals("RUB", json.path("amount").path("currency").asText())
        assertEquals(true, json.path("capture").asBoolean())
        assertEquals("redirect", json.path("confirmation").path("type").asText())
        assertEquals("https://online.play-and-say.ru/pay/token", json.path("confirmation").path("return_url").asText())
        assertEquals(invoiceId.toString(), json.path("metadata").path("invoiceId").asText())
        assertEquals(paymentAttemptId.toString(), json.path("metadata").path("paymentAttemptId").asText())
    }

    @Test
    fun `fetch payment maps succeeded YooKassa payment to provider status`() {
        val invoiceId = UUID.randomUUID()
        val paymentAttemptId = UUID.randomUUID()
        val httpClient = RecordingPaymentProviderHttpClient(
            getResponse = """
                {
                  "id": "pay-1",
                  "status": "succeeded",
                  "amount": {
                    "value": "3500.00",
                    "currency": "RUB"
                  },
                  "metadata": {
                    "invoiceId": "$invoiceId",
                    "paymentAttemptId": "$paymentAttemptId"
                  }
                }
            """.trimIndent(),
        )
        val client = YooKassaPaymentProviderClient(
            apiUrl = "https://api.yookassa.test/v3",
            shopId = "123456",
            secretKey = "test_secret",
            httpClient = httpClient,
        )

        val status = client.fetchPayment("pay-1")

        assertEquals("pay-1", status.providerPaymentId)
        assertEquals(PaymentAttemptStatus.SUCCEEDED, status.status)
        assertEquals(350_000, status.amountMinor)
        assertEquals("RUB", status.currency)
        assertEquals(invoiceId, status.invoiceId)
        assertEquals(paymentAttemptId, status.paymentAttemptId)
        val request = httpClient.requests.single()
        assertEquals("GET", request.method)
        assertEquals("https://api.yookassa.test/v3/payments/pay-1", request.url)
    }
}

private class RecordingPaymentProviderHttpClient(
    private val postResponse: String = """{"id":"pay-1","status":"pending","confirmation":{"confirmation_url":"https://checkout.test"}}""",
    private val getResponse: String = """{"id":"pay-1","status":"succeeded","amount":{"value":"1.00","currency":"RUB"},"metadata":{}}""",
) : PaymentProviderHttpClient {
    val requests = mutableListOf<PaymentProviderHttpRequest>()

    override fun send(request: PaymentProviderHttpRequest): PaymentProviderHttpResponse {
        requests += request
        return PaymentProviderHttpResponse(
            statusCode = 200,
            body = if (request.method == "GET") getResponse else postResponse,
        )
    }
}
