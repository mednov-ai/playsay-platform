package com.playsay.gateway

import com.playsay.gateway.dto.PaymentCheckoutResponse
import com.playsay.gateway.dto.PaymentInvoiceCreatedResponse
import com.playsay.gateway.dto.PaymentInvoiceDetailResponse
import com.playsay.gateway.dto.PaymentInvoiceResponse
import com.playsay.gateway.dto.PaymentProviderEventResponse
import com.playsay.gateway.service.InternalPaymentInvoiceCreatePayload
import com.playsay.gateway.service.PaymentServiceClient
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpStatus

@SpringBootTest(
    webEnvironment = WebEnvironment.RANDOM_PORT,
    properties = [
        "spring.datasource.url=jdbc:h2:mem:payment-webhook-security;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
class PaymentWebhookSecurityTest @Autowired constructor(
    @param:LocalServerPort private val port: Int,
) {
    @TestConfiguration
    class PaymentWebhookSecurityTestConfig {
        @Bean
        @Primary
        fun paymentServiceClient(): PaymentServiceClient = AnonymousWebhookPaymentServiceClient()
    }

    @Test
    fun `yookassa webhook endpoint does not require bearer token`() {
        val response = HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(
                URI.create("http://127.0.0.1:$port/payment-webhooks/yookassa"),
            )
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"event":"payment.succeeded","object":{"id":"pay-1"}}"""))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.OK.value(), response.statusCode(), response.body())
    }
}

private class AnonymousWebhookPaymentServiceClient : PaymentServiceClient {
    override fun createInvoice(payload: InternalPaymentInvoiceCreatePayload): PaymentInvoiceCreatedResponse =
        throw UnsupportedOperationException()

    override fun listInvoices(): List<PaymentInvoiceResponse> =
        throw UnsupportedOperationException()

    override fun adminInvoice(invoiceId: UUID): PaymentInvoiceDetailResponse =
        throw UnsupportedOperationException()

    override fun cancelInvoice(invoiceId: UUID): PaymentInvoiceResponse =
        throw UnsupportedOperationException()

    override fun publicInvoice(publicToken: String): PaymentInvoiceResponse =
        throw UnsupportedOperationException()

    override fun createCheckout(publicToken: String): PaymentCheckoutResponse =
        throw UnsupportedOperationException()

    override fun processYooKassaWebhook(rawBody: String): PaymentProviderEventResponse =
        PaymentProviderEventResponse(
            id = UUID.randomUUID(),
            provider = "YOOKASSA",
            eventType = "payment.succeeded",
            providerPaymentId = "pay-1",
            status = "PROCESSED",
            receivedAt = Instant.EPOCH,
            processedAt = Instant.EPOCH,
        )
}
