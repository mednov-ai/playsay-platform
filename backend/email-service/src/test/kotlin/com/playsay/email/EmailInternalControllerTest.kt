package com.playsay.email

import com.playsay.email.repo.EmailDeliveryAttemptRepo
import com.playsay.email.repo.EmailProviderAttemptRepo
import com.playsay.email.service.OutboundEmail
import com.playsay.email.service.OutboundEmailSender
import com.playsay.email.service.EmailProviderStatusService
import com.playsay.email.service.ProviderDeliveryEvent
import com.playsay.email.service.TransactionalEmailService
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Instant
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.assertNotNull
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
        "playsay.email-service.replay-encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "playsay.email-service.provider-reconcile-initial-delay-ms=3600000",
        "playsay.email-service.webhook-check-initial-delay-ms=3600000",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class EmailInternalControllerTest @Autowired constructor(
    @param:LocalServerPort private val port: Int,
    private val dataSource: DataSource,
    private val deliveryAttempts: EmailDeliveryAttemptRepo,
    private val providerAttempts: EmailProviderAttemptRepo,
    private val providerStatusService: EmailProviderStatusService,
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
        val sent = RecordingOutboundEmailSender.sent.last()
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
        assertTrue(sent.textBody.contains("https://online.play-and-say.ru/reset-password?email=student%40example.com"))
        assertTrue(sent.htmlBody.contains("123456"))
        assertTrue(sent.htmlBody.contains("href=\"https://online.play-and-say.ru/reset-password?email=student%40example.com\""))
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

    @Test
    fun `admin journal exposes delivery metadata without replay payload`() {
        val response = sendTransactionalEmail(chatDigestEmailBody("admin-journal", "en"))
        assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())

        val journal = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/admin/email-deliveries?search=student-chat-admin-journal%40example.com"))
                .header("X-PlaySay-Email-Service-Token", "test-email-token-0123456789")
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.OK.value(), journal.statusCode(), journal.body())
        assertTrue(journal.body().contains("student-chat-admin-journal@example.com"))
        assertTrue(journal.body().contains("\"providerStatus\":\"NOT_TRACKED\""))
        assertTrue(!journal.body().contains("replayCiphertext"))
        assertTrue(!journal.body().contains("Private message body"))
    }

    @Test
    fun `failed delivery is persisted and can be resent from encrypted snapshot`() {
        RecordingOutboundEmailSender.failNext = true
        val first = sendTransactionalEmail(chatDigestEmailBody("manual-resend", "en"))
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR.value(), first.statusCode())
        val failed = assertNotNull(deliveryAttempts.findByIdempotencyKey("chat-unread-digest:manual-resend"))
        assertEquals("FAILED", failed.status)
        assertNotNull(failed.replayCiphertext)
        assertTrue(!failed.replayCiphertext!!.contains("student-chat-manual-resend@example.com"))

        val resent = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/admin/email-deliveries/${failed.id}/resend"))
                .header("content-type", "application/json")
                .header("X-PlaySay-Email-Service-Token", "test-email-token-0123456789")
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.OK.value(), resent.statusCode(), resent.body())
        assertEquals("SENT", deliveryAttempts.findById(failed.id).orElseThrow().status)
        assertEquals(2, providerAttempts.findAllByEmailDeliveryIdOrderByAttemptNumberDesc(failed.id).size)
    }

    @Test
    fun `provider delivery events keep factual terminal status and ignore older events`() {
        val response = sendTransactionalEmail(chatDigestEmailBody("provider-status", "en"))
        assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        val delivery = deliveryAttempts.findByIdempotencyKey("chat-unread-digest:provider-status")!!
        val attempt = providerAttempts.findAllByEmailDeliveryIdOrderByAttemptNumberDesc(delivery.id).single()
        attempt.provider = TransactionalEmailService.PROVIDER_UNISENDER
        attempt.providerJobId = "job-provider-status"
        attempt.providerStatus = "ACCEPTED"
        attempt.trackingUntil = Instant.parse("2026-07-22T12:00:00Z")
        providerAttempts.saveAndFlush(attempt)
        delivery.provider = TransactionalEmailService.PROVIDER_UNISENDER
        delivery.providerJobId = attempt.providerJobId
        delivery.providerStatus = "ACCEPTED"
        delivery.providerTrackingUntil = attempt.trackingUntil
        deliveryAttempts.saveAndFlush(delivery)

        providerStatusService.apply(
            TransactionalEmailService.PROVIDER_UNISENDER,
            ProviderDeliveryEvent(
                jobId = "job-provider-status",
                status = "delivered",
                deliveryStatus = "ok_delivered",
                destinationResponse = "250 accepted",
                eventAt = Instant.parse("2026-07-20T12:05:00Z"),
            ),
        )
        providerStatusService.apply(
            TransactionalEmailService.PROVIDER_UNISENDER,
            ProviderDeliveryEvent(
                jobId = "job-provider-status",
                status = "sent",
                eventAt = Instant.parse("2026-07-20T12:04:00Z"),
            ),
        )
        assertEquals("DELIVERED", deliveryAttempts.findById(delivery.id).orElseThrow().providerStatus)
        assertEquals(null, deliveryAttempts.findById(delivery.id).orElseThrow().providerTrackingUntil)

        providerStatusService.apply(
            TransactionalEmailService.PROVIDER_UNISENDER,
            ProviderDeliveryEvent(
                jobId = "job-provider-status",
                status = "opened",
                eventAt = Instant.parse("2026-07-20T12:06:00Z"),
            ),
        )
        assertEquals("OPENED", deliveryAttempts.findById(delivery.id).orElseThrow().providerStatus)
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
            "expiresMinutes": "15",
            "resetUrl": "https://online.play-and-say.ru/reset-password?email=student%40example.com"
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

    override fun send(email: OutboundEmail): com.playsay.email.service.OutboundEmailResult {
        if (failNext) {
            failNext = false
            throw IllegalStateException("simulated provider failure")
        }
        sent += email
        return com.playsay.email.service.OutboundEmailResult(
            provider = "TEST",
            providerStatus = "NOT_TRACKED",
        )
    }
}
