package com.playsay.payment

import com.playsay.payment.service.PaymentAttemptStatus
import com.playsay.payment.service.PaymentProviderClient
import com.playsay.payment.service.ProviderPaymentCreateCommand
import com.playsay.payment.service.ProviderPaymentCreateResult
import com.playsay.payment.service.ProviderPaymentStatus
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.TestInstance
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpStatus

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "spring.datasource.url=jdbc:h2:mem:payment-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.payment-service.service-token=test-payment-token-0123456789",
        "playsay.payment-service.public-base-url=https://online.play-and-say.ru",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PaymentInternalControllerTest @Autowired constructor(
    @param:LocalServerPort private val port: Int,
    private val dataSource: DataSource,
) {
    @TestConfiguration
    class PaymentProviderTestConfig {
        @Bean
        @Primary
        fun paymentProviderClient(): PaymentProviderClient = ControllerRecordingPaymentProviderClient()
    }

    private val httpClient = HttpClient.newHttpClient()

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@PaymentInternalControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @Test
    fun `internal endpoints require payment service token`() {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/admin/payment-invoices"))
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(createInvoiceBody()))
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        )

        assertEquals(HttpStatus.UNAUTHORIZED.value(), response.statusCode())
    }

    @Test
    fun `webhook endpoint requires payment service token from gateway`() {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/payment-webhooks/yookassa"))
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"event":"payment.succeeded","object":{"id":"pay-1"}}"""))
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        )

        assertEquals(HttpStatus.UNAUTHORIZED.value(), response.statusCode())
    }

    @Test
    fun `creates invoice and checkout through internal api`() {
        val created = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/admin/payment-invoices"))
                .header("content-type", "application/json")
                .header("X-PlaySay-Payment-Service-Token", "test-payment-token-0123456789")
                .POST(HttpRequest.BodyPublishers.ofString(createInvoiceBody()))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.CREATED.value(), created.statusCode())
        assertTrue(created.body().contains("publicUrlToken"))
        val token = """"publicUrlToken"\s*:\s*"([^"]+)"""".toRegex().find(created.body())!!.groupValues[1]

        val checkout = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/public/payment-invoices/$token/checkout"))
                .header("content-type", "application/json")
                .header("X-PlaySay-Payment-Service-Token", "test-payment-token-0123456789")
                .POST(HttpRequest.BodyPublishers.noBody())
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.OK.value(), checkout.statusCode())
        assertTrue(checkout.body().contains("https://checkout.test/pay-1"))

        val webhook = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/payment-webhooks/yookassa"))
                .header("content-type", "application/json")
                .header("X-PlaySay-Payment-Service-Token", "test-payment-token-0123456789")
                .POST(HttpRequest.BodyPublishers.ofString("""{"event":"payment.succeeded","object":{"id":"pay-1"}}"""))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.OK.value(), webhook.statusCode(), webhook.body())
        assertTrue(webhook.body().contains("PROCESSED"))
    }

    private fun createInvoiceBody(): String =
        """
        {
          "amountMinor": 350000,
          "currency": "RUB",
          "description": "Honey School lesson package",
          "createdBySubject": "teacher-1",
          "studentUserId": null,
          "payerName": "Parent",
          "payerEmail": "parent@example.com",
          "payerPhone": null,
          "dueAt": null
        }
        """.trimIndent()
}

private class ControllerRecordingPaymentProviderClient : PaymentProviderClient {
    private val attempts = mutableMapOf<String, ProviderPaymentCreateCommand>()

    override fun createPayment(command: ProviderPaymentCreateCommand): ProviderPaymentCreateResult {
        attempts["pay-1"] = command
        return ProviderPaymentCreateResult(
            providerPaymentId = "pay-1",
            confirmationUrl = "https://checkout.test/pay-1",
            status = PaymentAttemptStatus.WAITING_FOR_CONFIRMATION,
        )
    }

    override fun fetchPayment(providerPaymentId: String): ProviderPaymentStatus {
        val command = attempts.getValue(providerPaymentId)
        return ProviderPaymentStatus(
            providerPaymentId = providerPaymentId,
            status = PaymentAttemptStatus.SUCCEEDED,
            amountMinor = command.amountMinor,
            currency = command.currency,
            invoiceId = command.invoiceId,
            paymentAttemptId = UUID.fromString(command.metadata.getValue("paymentAttemptId")),
        )
    }
}
