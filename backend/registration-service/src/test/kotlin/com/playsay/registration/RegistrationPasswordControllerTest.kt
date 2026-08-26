package com.playsay.registration

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.playsay.registration.service.KeycloakRegistrationClient
import com.playsay.registration.service.KeycloakRegistrationUser
import com.playsay.registration.service.KeycloakTokenSet
import com.playsay.registration.service.KeycloakUserCreateCommand
import com.playsay.registration.repo.ManagedStudentInviteRepo
import com.playsay.registration.repo.PendingRegistrationRepo
import com.playsay.registration.service.RegistrationEmailClient
import com.playsay.registration.service.RegistrationEmailCommand
import com.playsay.registration.service.PasswordResetEmailCommand
import com.playsay.registration.service.RegistrationService
import java.time.Instant
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import liquibase.integration.spring.SpringLiquibase
import org.springframework.data.jpa.repository.Lock
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.HttpStatus
import org.slf4j.LoggerFactory

class RegistrationPasswordControllerTest : RegistrationControllerTestFixture() {
    @Test
    fun `registration start uses generic response for duplicate email`() {
        val first = startRegistration("duplicate@example.com")
        val second = startRegistration("duplicate@example.com")

        assertEquals(HttpStatus.ACCEPTED.value(), first.statusCode())
        assertEquals(HttpStatus.ACCEPTED.value(), second.statusCode())
        assertTrue(first.body().contains("CHECK_EMAIL"))
        assertTrue(second.body().contains("CHECK_EMAIL"))
    }

    @Test
    fun `existing keycloak email receives generic response without a new pending token`() {
        val email = "existing@example.com"
        RecordingKeycloakRegistrationClient.existingUsers[email] = KeycloakRegistrationUser(
            username = email,
            email = email,
            enabled = true,
            emailVerified = true,
        )

        val response = startRegistration(email)

        assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        assertTrue(response.body().contains("CHECK_EMAIL"))
        assertTrue(RecordingKeycloakRegistrationClient.createdUsers.isEmpty())
        assertTrue(RecordingRegistrationEmailClient.registrationConfirmations.isEmpty())
        assertEquals(email, RecordingRegistrationEmailClient.passwordResets.single().to)
        assertEquals(6, RecordingRegistrationEmailClient.passwordResets.single().code.length)
        assertTrue(
            pendingRegistrationRepo.findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, "PENDING") == null,
        )
    }

    @Test
    fun `existing disabled keycloak email receives a new confirmation token`() {
        val email = "disabled-existing@example.com"
        RecordingKeycloakRegistrationClient.existingUsers[email] = KeycloakRegistrationUser(
            username = email,
            email = email,
            enabled = false,
            emailVerified = false,
        )

        val response = startRegistration(email, password = "NewRiver2026!")

        assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        assertTrue(response.body().contains("CHECK_EMAIL"))
        assertTrue(RecordingKeycloakRegistrationClient.createdUsers.isEmpty())
        assertEquals("NewRiver2026!", RecordingKeycloakRegistrationClient.updatedPasswords[email])
        assertEquals(email, RecordingRegistrationEmailClient.registrationConfirmations.single().to)
        assertTrue(pendingRegistration(email).expiresAt.isAfter(Instant.EPOCH))
    }

    @Test
    fun `registration start rejects weak passwords`() {
        val response = startRegistration(email = "weak@example.com", password = "password")

        assertEquals(HttpStatus.BAD_REQUEST.value(), response.statusCode(), response.body())
        assertTrue(RecordingKeycloakRegistrationClient.createdUsers.isEmpty())
        assertTrue(RecordingRegistrationEmailClient.registrationConfirmations.isEmpty())
        assertTrue(RecordingRegistrationEmailClient.passwordResets.isEmpty())
    }

    @Test
    fun `forgot password sends generic response and reset code for existing user`() {
        val email = "forgot@example.com"
        RecordingKeycloakRegistrationClient.existingUsers[email] = KeycloakRegistrationUser(
            username = email,
            email = email,
            enabled = true,
            emailVerified = true,
        )

        val response = forgotPassword(email)

        assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        assertTrue(response.body().contains("CHECK_EMAIL"))
        val reset = RecordingRegistrationEmailClient.passwordResets.single()
        assertEquals(email, reset.to)
        assertEquals("en", reset.locale)
        assertEquals(6, reset.code.length)
        assertEquals("https://dev.online.honey.school/reset-password?email=forgot%40example.com", reset.resetUrl)
    }

    @Test
    fun `forgot password keeps a generic response for unknown inactive and cooldown outcomes`() {
        val inactive = "inactive@example.test"
        RecordingKeycloakRegistrationClient.existingUsers[inactive] = KeycloakRegistrationUser(
            username = inactive,
            email = inactive,
            enabled = false,
            emailVerified = true,
        )
        val active = "cooldown@example.test"
        RecordingKeycloakRegistrationClient.existingUsers[active] = KeycloakRegistrationUser(
            username = active,
            email = active,
            enabled = true,
            emailVerified = true,
        )

        val unknownResponse = forgotPassword("unknown@example.test")
        val inactiveResponse = forgotPassword(inactive)
        val firstActiveResponse = forgotPassword(active)
        val cooldownResponse = forgotPassword(active)

        listOf(unknownResponse, inactiveResponse, firstActiveResponse, cooldownResponse).forEach { response ->
            assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
            assertTrue(response.body().contains("CHECK_EMAIL"))
        }
        assertEquals(listOf(active), RecordingRegistrationEmailClient.passwordResets.map { it.to })
    }

    @Test
    fun `forgot password logs only sanitized outcome categories`() {
        val active = "log-active@example.test"
        val inactive = "log-inactive@example.test"
        val deliveryFailure = "log-failure@example.test"
        listOf(active, deliveryFailure).forEach { email ->
            RecordingKeycloakRegistrationClient.existingUsers[email] = KeycloakRegistrationUser(
                username = email,
                email = email,
                enabled = true,
                emailVerified = true,
            )
        }
        RecordingKeycloakRegistrationClient.existingUsers[inactive] = KeycloakRegistrationUser(
            username = inactive,
            email = inactive,
            enabled = false,
            emailVerified = true,
        )
        val logger = LoggerFactory.getLogger(RegistrationService::class.java) as Logger
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)
        try {
            forgotPassword(active)
            forgotPassword(active)
            forgotPassword(inactive)
            forgotPassword("log-unknown@example.test")
            RecordingRegistrationEmailClient.passwordResetFailure = RuntimeException(
                "mail provider rejected $deliveryFailure with code 654321",
            )
            val failed = forgotPassword(deliveryFailure)

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR.value(), failed.statusCode())
            RecordingRegistrationEmailClient.passwordResetFailure = null
            val retryAfterRollback = forgotPassword(deliveryFailure)
            assertEquals(HttpStatus.ACCEPTED.value(), retryAfterRollback.statusCode(), retryAfterRollback.body())
            assertEquals(listOf(active, deliveryFailure), RecordingRegistrationEmailClient.passwordResets.map { it.to })
            val logText = appender.list.joinToString("\n") { it.formattedMessage }
            listOf("CODE_SENT", "COOLDOWN", "ACCOUNT_NOT_ACTIVE", "EMAIL_DELIVERY_FAILED").forEach {
                assertTrue(logText.contains("outcome=$it"), logText)
            }
            listOf(active, inactive, deliveryFailure, "log-unknown@example.test", "654321").forEach {
                assertFalse(logText.contains(it), logText)
            }
        } finally {
            logger.detachAppender(appender)
        }
    }

    @Test
    fun `reset password consumes one-time code and updates keycloak password`() {
        val email = "reset@example.com"
        RecordingKeycloakRegistrationClient.existingUsers[email] = KeycloakRegistrationUser(
            username = email,
            email = email,
            enabled = true,
            emailVerified = true,
        )
        forgotPassword(email)
        val code = RecordingRegistrationEmailClient.passwordResets.single().code

        val reset = resetPassword(email = email, code = code, newPassword = "Better2026!")
        val repeated = resetPassword(email = email, code = code, newPassword = "Better2027!")

        assertEquals(HttpStatus.OK.value(), reset.statusCode(), reset.body())
        assertTrue(reset.body().contains("PASSWORD_RESET"))
        assertEquals("Better2026!", RecordingKeycloakRegistrationClient.updatedPasswords[email])
        assertEquals(HttpStatus.BAD_REQUEST.value(), repeated.statusCode(), repeated.body())
        assertEquals("Better2026!", RecordingKeycloakRegistrationClient.updatedPasswords[email])
    }

    @Test
    fun `reset password rejects weak new password before keycloak update`() {
        val email = "reset-weak@example.com"
        RecordingKeycloakRegistrationClient.existingUsers[email] = KeycloakRegistrationUser(
            username = email,
            email = email,
            enabled = true,
            emailVerified = true,
        )
        forgotPassword(email)
        val code = RecordingRegistrationEmailClient.passwordResets.single().code

        val reset = resetPassword(email = email, code = code, newPassword = "12345678")

        assertEquals(HttpStatus.BAD_REQUEST.value(), reset.statusCode(), reset.body())
        assertTrue(RecordingKeycloakRegistrationClient.updatedPasswords.isEmpty())
    }

}
