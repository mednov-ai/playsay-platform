package com.playsay.email

import com.playsay.email.service.OutboundEmail
import com.playsay.email.service.OutboundEmailSender
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.TestInstance
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
        "spring.datasource.url=jdbc:h2:mem:email-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.email-service.service-token=test-email-token-0123456789",
        "playsay.email-service.from-address=no-reply@play-and-say.ru",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class EmailInternalControllerTest @Autowired constructor(
    @param:LocalServerPort private val port: Int,
    private val dataSource: DataSource,
) {
    @TestConfiguration
    class EmailSenderTestConfig {
        @Bean
        @Primary
        fun outboundEmailSender(): OutboundEmailSender = RecordingOutboundEmailSender
    }

    private val httpClient = HttpClient.newHttpClient()

    @BeforeAll
    fun migrateDatabase() {
        RecordingOutboundEmailSender.sent.clear()
        SpringLiquibase().apply {
            this.dataSource = this@EmailInternalControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @Test
    fun `internal email endpoint requires service token`() {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/emails/transactional"))
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(transactionalEmailBody()))
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        )

        assertEquals(HttpStatus.UNAUTHORIZED.value(), response.statusCode())
    }

    @Test
    fun `sends localized registration confirmation email idempotently`() {
        val first = sendTransactionalEmail()
        val second = sendTransactionalEmail()

        assertEquals(HttpStatus.ACCEPTED.value(), first.statusCode(), first.body())
        assertEquals(HttpStatus.ACCEPTED.value(), second.statusCode(), second.body())
        assertEquals(1, RecordingOutboundEmailSender.sent.size)
        val sent = RecordingOutboundEmailSender.sent.single()
        assertEquals("student@example.com", sent.to)
        assertEquals("no-reply@play-and-say.ru", sent.from)
        assertTrue(sent.subject.contains("Play&Say"))
        assertTrue(sent.textBody.contains("https://online.play-and-say.ru/register/confirm?token=token-1"))
    }

    private fun sendTransactionalEmail(): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/emails/transactional"))
                .header("content-type", "application/json")
                .header("X-PlaySay-Email-Service-Token", "test-email-token-0123456789")
                .POST(HttpRequest.BodyPublishers.ofString(transactionalEmailBody()))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun transactionalEmailBody(): String =
        """
        {
          "to": "student@example.com",
          "templateKey": "registration-confirmation",
          "locale": "en",
          "idempotencyKey": "registration:student@example.com:token-1",
          "model": {
            "displayName": "Student",
            "confirmationUrl": "https://online.play-and-say.ru/register/confirm?token=token-1"
          }
        }
        """.trimIndent()
}

private object RecordingOutboundEmailSender : OutboundEmailSender {
    val sent = mutableListOf<OutboundEmail>()

    override fun send(email: OutboundEmail) {
        sent += email
    }
}
