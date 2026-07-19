package com.playsay.email

import com.playsay.email.repo.EmailDeliveryAttemptRepo
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
    private val deliveryAttempts: EmailDeliveryAttemptRepo,
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
        RecordingOutboundEmailSender.failNext = false
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
        assertTrue(sent.htmlBody.contains("https://online.play-and-say.ru/register/confirm?token=token-1"))
        assertTrue(sent.htmlBody.contains("<a"))
    }

    @Test
    fun `sends localized password reset code email from database template`() {
        val response = sendTransactionalEmail(passwordResetEmailBody())

        assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        val sent = RecordingOutboundEmailSender.sent.last()
        assertEquals("student@example.com", sent.to)
        assertTrue(sent.subject.contains("Play&Say"))
        assertTrue(sent.textBody.contains("123456"))
        assertTrue(sent.textBody.contains("15"))
        assertTrue(sent.htmlBody.contains("123456"))
    }

    @Test
    fun `sends lesson reminder email from database template`() {
        val response = sendTransactionalEmail(lessonReminderEmailBody())

        assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        val sent = RecordingOutboundEmailSender.sent.last()
        assertEquals("student@example.com", sent.to)
        assertTrue(sent.subject.contains("Play&Say"))
        assertTrue(sent.textBody.contains("Lesson demo"))
        assertTrue(sent.textBody.contains("https://online.play-and-say.ru/lessons/lesson-1/classroom"))
        assertTrue(sent.htmlBody.contains("Lesson demo"))
        assertTrue(sent.htmlBody.contains("https://online.play-and-say.ru/lessons/lesson-1/classroom"))
    }

    @Test
    fun `renders lesson rescheduled email in every supported locale`() {
        val before = RecordingOutboundEmailSender.sent.size

        listOf("ru", "en", "de", "fr").forEach { locale ->
            val response = sendTransactionalEmail(lessonRescheduledEmailBody(locale))
            assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        }

        val sent = RecordingOutboundEmailSender.sent.drop(before)
        assertEquals(4, sent.size)
        sent.forEach { email ->
            assertTrue(email.subject.contains("Play&Say"))
            assertTrue(email.textBody.contains("18 Jul 2026, 10:00"))
            assertTrue(email.textBody.contains("18 Jul 2026, 10:45"))
            assertTrue(email.textBody.contains("19 Jul 2026, 12:00"))
            assertTrue(email.textBody.contains("19 Jul 2026, 12:45"))
            assertTrue(email.textBody.contains("Teacher Demo"))
            assertTrue(email.htmlBody.contains("https://online.play-and-say.ru/lessons/lesson-1/classroom"))
        }
    }

    @Test
    fun `renders chat digest in every locale without exposing message text`() {
        val before = RecordingOutboundEmailSender.sent.size
        listOf("ru", "en", "de", "fr").forEach { locale ->
            val response = sendTransactionalEmail(chatDigestEmailBody(locale, locale))
            assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        }

        val sent = RecordingOutboundEmailSender.sent.drop(before)
        assertEquals(4, sent.size)
        sent.forEach { email ->
            assertTrue(email.subject.contains("Play&Say"))
            assertTrue(email.textBody.contains("3"))
            assertTrue(email.textBody.contains("Teacher Demo"))
            assertTrue(email.htmlBody.contains("https://online.play-and-say.ru/?chat=open"))
            assertTrue(!email.textBody.contains("Private message body"))
            assertTrue(!email.htmlBody.contains("Private message body"))
        }
    }

    @Test
    fun `failed idempotent delivery can be retried with the same key`() {
        val before = RecordingOutboundEmailSender.sent.size
        RecordingOutboundEmailSender.failNext = true
        val first = sendTransactionalEmail(chatDigestEmailBody("retry", "en"))
        assertEquals(
            "FAILED",
            deliveryAttempts.findByIdempotencyKey("chat-unread-digest:retry")?.status,
        )
        val second = sendTransactionalEmail(chatDigestEmailBody("retry", "en"))

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR.value(), first.statusCode())
        assertEquals(HttpStatus.ACCEPTED.value(), second.statusCode(), second.body())
        assertEquals(before + 1, RecordingOutboundEmailSender.sent.size)
    }

    private fun sendTransactionalEmail(body: String = transactionalEmailBody()): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/emails/transactional"))
                .header("content-type", "application/json")
                .header("X-PlaySay-Email-Service-Token", "test-email-token-0123456789")
                .POST(HttpRequest.BodyPublishers.ofString(body))
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

    private fun passwordResetEmailBody(): String =
        """
        {
          "to": "student@example.com",
          "templateKey": "password-reset-code",
          "locale": "en",
          "idempotencyKey": "password-reset:student@example.com:code-1",
          "model": {
            "displayName": "Student",
            "code": "123456",
            "expiresMinutes": "15"
          }
        }
        """.trimIndent()

    private fun lessonReminderEmailBody(): String =
        """
        {
          "to": "student@example.com",
          "templateKey": "lesson-reminder-30m",
          "locale": "en",
          "idempotencyKey": "lesson-reminder-30m:lesson-1:student-1:2026-06-29T10:00:00Z",
          "model": {
            "displayName": "Student",
            "lessonTitle": "Lesson demo",
            "startsAt": "29 Jun 2026, 10:00",
            "teacherName": "Teacher",
            "studentNames": "Student",
            "lessonUrl": "https://online.play-and-say.ru/lessons/lesson-1/classroom"
          }
        }
        """.trimIndent()

    private fun lessonRescheduledEmailBody(locale: String): String =
        """
        {
          "to": "student-$locale@example.com",
          "templateKey": "lesson-rescheduled",
          "locale": "$locale",
          "idempotencyKey": "lesson-rescheduled:lesson-1:student-$locale:2026-07-19T12:00:00Z",
          "model": {
            "displayName": "Student",
            "lessonTitle": "Lesson demo",
            "previousStartsAt": "18 Jul 2026, 10:00",
            "previousEndsAt": "18 Jul 2026, 10:45",
            "startsAt": "19 Jul 2026, 12:00",
            "endsAt": "19 Jul 2026, 12:45",
            "teacherName": "Teacher Demo",
            "lessonUrl": "https://online.play-and-say.ru/lessons/lesson-1/classroom"
          }
        }
        """.trimIndent()

    private fun chatDigestEmailBody(suffix: String = "default", locale: String = "en"): String =
        """
        {
          "to": "student-chat-$suffix@example.com",
          "templateKey": "chat-unread-digest",
          "locale": "$locale",
          "idempotencyKey": "chat-unread-digest:$suffix",
          "model": {
            "displayName": "Student",
            "messageCount": "3",
            "senderNames": "Teacher Demo",
            "additionalSenderCount": "0",
            "chatUrl": "https://online.play-and-say.ru/?chat=open"
          }
        }
        """.trimIndent()
}

private object RecordingOutboundEmailSender : OutboundEmailSender {
    val sent = mutableListOf<OutboundEmail>()
    var failNext = false

    override fun send(email: OutboundEmail) {
        if (failNext) {
            failNext = false
            throw IllegalStateException("simulated provider failure")
        }
        sent += email
    }
}
