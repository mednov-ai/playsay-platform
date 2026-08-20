package com.playsay.payment

import com.playsay.payment.fixture.PaymentInvoiceOperationsBehavior
import com.playsay.payment.fixture.RecordingPaymentProviderClient
import com.playsay.payment.service.PaymentInvoiceOperations
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "spring.datasource.url=jdbc:h2:mem:payment-persistence;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.payment-service.service-token=test-payment-token-0123456789",
        "playsay.payment-service.public-base-url=https://online.play-and-say.ru",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PaymentPersistenceTest @Autowired constructor(
    @param:LocalServerPort private val port: Int,
    private val jdbcTemplate: JdbcTemplate,
    private val dataSource: DataSource,
    private val paymentOperations: PaymentInvoiceOperations,
    private val recordingProvider: RecordingPaymentProviderClient,
) : PaymentInvoiceOperationsBehavior() {
    @TestConfiguration
    class PaymentProviderTestConfig {
        @Bean
        @Primary
        fun paymentProviderClient(): RecordingPaymentProviderClient = RecordingPaymentProviderClient()
    }

    private val httpClient = HttpClient.newHttpClient()

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@PaymentPersistenceTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun resetPersistenceState() {
        jdbcTemplate.update("delete from payment_provider_events")
        jdbcTemplate.update("delete from payment_attempts")
        jdbcTemplate.update("delete from payment_invoices")
        recordingProvider.reset()
    }

    override fun operations(): PaymentInvoiceOperations = paymentOperations

    override fun provider(): RecordingPaymentProviderClient = recordingProvider

    @Test
    fun `invoice and checkout attempt are persisted in database`() {
        val created = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/admin/payment-invoices"))
                .header("content-type", "application/json")
                .header("X-PlaySay-Payment-Service-Token", "test-payment-token-0123456789")
                .POST(HttpRequest.BodyPublishers.ofString(createInvoiceBody()))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(201, created.statusCode())
        val token = """"publicUrlToken"\s*:\s*"([^"]+)"""".toRegex().find(created.body())!!.groupValues[1]
        val invoiceId = """"id"\s*:\s*"([^"]+)"""".toRegex().find(created.body())!!.groupValues[1]
        val stored = jdbcTemplate.queryForMap("select status, public_token_hash from payment_invoices where id = ?", UUID.fromString(invoiceId))

        assertEquals("OPEN", stored["status"])
        assertTrue((stored["public_token_hash"] as String).length == 64)
        assertNotEquals(token, stored["public_token_hash"])

        val checkout = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/public/payment-invoices/$token/checkout"))
                .header("content-type", "application/json")
                .header("X-PlaySay-Payment-Service-Token", "test-payment-token-0123456789")
                .POST(HttpRequest.BodyPublishers.noBody())
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(200, checkout.statusCode())
        assertEquals(
            "PAYMENT_PENDING",
            jdbcTemplate.queryForObject("select status from payment_invoices where id = ?", String::class.java, UUID.fromString(invoiceId)),
        )
        assertEquals(
            1L,
            jdbcTemplate.queryForObject("select count(*) from payment_attempts where invoice_id = ?", Long::class.java, UUID.fromString(invoiceId)),
        )
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
