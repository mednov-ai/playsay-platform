package com.playsay.registration

import com.playsay.registration.service.KeycloakRegistrationClient
import com.playsay.registration.service.KeycloakRegistrationUser
import com.playsay.registration.service.KeycloakTokenSet
import com.playsay.registration.service.KeycloakUserCreateCommand
import com.playsay.registration.repo.ManagedStudentInviteRepo
import com.playsay.registration.repo.PendingRegistrationRepo
import com.playsay.registration.service.RegistrationEmailClient
import com.playsay.registration.service.RegistrationEmailCommand
import com.playsay.registration.service.PasswordResetEmailCommand
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

class RegistrationConfirmationControllerTest : RegistrationControllerTestFixture() {
    @Test
    fun `resend respects cooldown and sends a new token after cooldown`() {
        val email = "resend@example.com"
        val started = startRegistration(email)

        assertEquals(HttpStatus.ACCEPTED.value(), started.statusCode())
        assertEquals(1, RecordingRegistrationEmailClient.registrationConfirmations.size)
        val firstConfirmationUrl = RecordingRegistrationEmailClient.registrationConfirmations.single().confirmationUrl

        val throttled = resendRegistration(email)
        assertEquals(HttpStatus.ACCEPTED.value(), throttled.statusCode())
        assertEquals(1, RecordingRegistrationEmailClient.registrationConfirmations.size)

        val pending = pendingRegistration(email)
        pending.emailSentAt = Instant.EPOCH
        pending.updatedAt = Instant.EPOCH
        pendingRegistrationRepo.saveAndFlush(pending)

        val resent = resendRegistration(email)
        assertEquals(HttpStatus.ACCEPTED.value(), resent.statusCode())
        assertEquals(2, RecordingRegistrationEmailClient.registrationConfirmations.size)
        assertTrue(RecordingRegistrationEmailClient.registrationConfirmations.last().confirmationUrl != firstConfirmationUrl)
    }

    @Test
    fun `expired confirmation token cannot enable keycloak user`() {
        val email = "expired@example.com"
        startRegistration(email)
        val token = lastConfirmationToken()
        val pending = pendingRegistration(email)
        pending.expiresAt = Instant.EPOCH
        pendingRegistrationRepo.saveAndFlush(pending)

        val confirmed = confirmRegistration(token)

        assertEquals(HttpStatus.BAD_REQUEST.value(), confirmed.statusCode())
        assertTrue(RecordingKeycloakRegistrationClient.enabledUsers.isEmpty())
        assertTrue(RecordingKeycloakRegistrationClient.assignedRoles.isEmpty())
    }

    @Test
    fun `confirming the same token twice is rejected`() {
        val email = "repeated@example.com"
        startRegistration(email)
        val token = lastConfirmationToken()

        val firstConfirm = confirmRegistration(token)
        val secondConfirm = confirmRegistration(token)

        assertEquals(HttpStatus.OK.value(), firstConfirm.statusCode())
        assertEquals(HttpStatus.BAD_REQUEST.value(), secondConfirm.statusCode())
        assertEquals(listOf(email), RecordingKeycloakRegistrationClient.enabledUsers)
        assertEquals(listOf("STUDENT"), RecordingKeycloakRegistrationClient.assignedRoles)
    }

    @Test
    fun `confirmed registration returns allowed keyboard continue url`() {
        val email = "keyboard-return@example.com"
        startRegistration(email, returnTo = "https://dev.key.honey.school/")

        val confirmed = confirmRegistration(lastConfirmationToken())

        assertEquals(HttpStatus.OK.value(), confirmed.statusCode(), confirmed.body())
        assertTrue(confirmed.body().contains("\"continueUrl\":\"https://dev.key.honey.school/\""))
    }

    @Test
    fun `confirmed registration drops unsafe external return url`() {
        val email = "unsafe-return@example.com"
        startRegistration(email, returnTo = "https://evil.example/phish")

        val confirmed = confirmRegistration(lastConfirmationToken())

        assertEquals(HttpStatus.OK.value(), confirmed.statusCode(), confirmed.body())
        assertFalse(confirmed.body().contains("evil.example"), confirmed.body())
        assertFalse(confirmed.body().contains("continueUrl"), confirmed.body())
    }

    @Test
    fun `start is rate limited per email with generic responses before the limit`() {
        val email = "limited@example.com"

        repeat(20) { index ->
            val response = startRegistration(email, forwardedFor = "203.0.113.${index + 1}")
            assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
            assertTrue(response.body().contains("CHECK_EMAIL"))
        }

        val limited = startRegistration(email, forwardedFor = "203.0.113.250")
        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), limited.statusCode())
    }

    @Test
    fun `start rate limit uses forwarded client address instead of gateway remote address`() {
        repeat(31) { index ->
            val response = startRegistration(
                email = "forwarded-$index@example.com",
                forwardedFor = "198.51.100.$index",
            )

            assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        }
    }

}
