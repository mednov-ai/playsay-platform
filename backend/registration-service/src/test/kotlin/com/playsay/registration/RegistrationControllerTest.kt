package com.playsay.registration

import com.playsay.registration.service.KeycloakRegistrationClient
import com.playsay.registration.service.KeycloakRegistrationUser
import com.playsay.registration.service.KeycloakUserCreateCommand
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
import kotlin.test.assertTrue
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
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
        "spring.datasource.url=jdbc:h2:mem:registration-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.registration.public-base-url=https://online.play-and-say.ru",
        "playsay.registration.keycloak.base-url=http://127.0.0.1:18080",
        "playsay.registration.keycloak.realm=playsay-dev",
        "playsay.registration.keycloak.client-id=playsay-registration-service",
        "playsay.registration.keycloak.client-secret=test-secret",
        "playsay.registration.email-service.base-url=http://127.0.0.1:18086",
        "playsay.registration.email-service.service-token=test-token",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RegistrationControllerTest @Autowired constructor(
    @param:LocalServerPort private val port: Int,
    private val dataSource: DataSource,
    private val pendingRegistrationRepo: PendingRegistrationRepo,
) {
    @TestConfiguration
    class RegistrationClientTestConfig {
        @Bean
        @Primary
        fun keycloakRegistrationClient(): KeycloakRegistrationClient = RecordingKeycloakRegistrationClient

        @Bean
        @Primary
        fun registrationEmailClient(): RegistrationEmailClient = RecordingRegistrationEmailClient
    }

    private val httpClient = HttpClient.newHttpClient()
    private var requestIpCounter = 0

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@RegistrationControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun resetRecorders() {
        RecordingKeycloakRegistrationClient.reset()
        RecordingRegistrationEmailClient.reset()
    }

    @Test
    fun `registers disabled keycloak user and confirms with student role`() {
        val started = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/start"))
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(startRegistrationBody()))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.ACCEPTED.value(), started.statusCode(), started.body())
        assertTrue(started.body().contains("CHECK_EMAIL"))
        val createdUser = RecordingKeycloakRegistrationClient.createdUsers.single()
        assertEquals("student@example.com", createdUser.email)
        assertFalse(createdUser.enabled)
        assertFalse(createdUser.emailVerified)
        assertTrue(
            RecordingRegistrationEmailClient.registrationConfirmations.single().confirmationUrl
                .startsWith("https://online.play-and-say.ru/register/confirm?token="),
        )

        val confirmed = confirmRegistration(lastConfirmationToken())

        assertEquals(HttpStatus.OK.value(), confirmed.statusCode(), confirmed.body())
        assertTrue(confirmed.body().contains("CONFIRMED"))
        assertEquals("student@example.com", RecordingKeycloakRegistrationClient.enabledUsers.single())
        assertEquals("STUDENT", RecordingKeycloakRegistrationClient.assignedRoles.single())
    }

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
    }

    @Test
    fun `reset password consumes one-time code and updates keycloak password`() {
        val email = "reset@example.com"
        RecordingKeycloakRegistrationClient.existingUsers[email] = KeycloakRegistrationUser(
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

    private fun startRegistration(email: String, forwardedFor: String? = nextForwardedFor()): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/start"))
                .header("content-type", "application/json")
                .apply {
                    forwardedFor?.let { header("X-Forwarded-For", it) }
                }
                .POST(HttpRequest.BodyPublishers.ofString(startRegistrationBody(email)))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun startRegistration(
        email: String,
        password: String,
        forwardedFor: String? = nextForwardedFor(),
    ): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/start"))
                .header("content-type", "application/json")
                .apply {
                    forwardedFor?.let { header("X-Forwarded-For", it) }
                }
                .POST(HttpRequest.BodyPublishers.ofString(startRegistrationBody(email = email, password = password)))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun resendRegistration(email: String, forwardedFor: String? = nextForwardedFor()): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/resend"))
                .header("content-type", "application/json")
                .apply {
                    forwardedFor?.let { header("X-Forwarded-For", it) }
                }
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        """{"email":"$email","locale":"en","returnTo":"https://key.play-and-say.ru/"}""",
                    ),
                )
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun confirmRegistration(token: String): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/confirm"))
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"token":"$token"}"""))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun forgotPassword(email: String, forwardedFor: String? = nextForwardedFor()): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/forgot-password"))
                .header("content-type", "application/json")
                .apply {
                    forwardedFor?.let { header("X-Forwarded-For", it) }
                }
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        """{"email":"$email","locale":"en","returnTo":"https://key.play-and-say.ru/"}""",
                    ),
                )
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun resetPassword(
        email: String,
        code: String,
        newPassword: String,
        forwardedFor: String? = nextForwardedFor(),
    ): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/reset-password"))
                .header("content-type", "application/json")
                .apply {
                    forwardedFor?.let { header("X-Forwarded-For", it) }
                }
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        """{"email":"$email","code":"$code","newPassword":"$newPassword"}""",
                    ),
                )
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun lastConfirmationToken(): String =
        URI.create(RecordingRegistrationEmailClient.registrationConfirmations.last().confirmationUrl)
            .query
            .split("&")
            .single { parameter -> parameter.startsWith("token=") }
            .removePrefix("token=")

    private fun pendingRegistration(email: String) =
        pendingRegistrationRepo.findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, "PENDING")
            ?: error("Pending registration was not saved for $email")

    private fun nextForwardedFor(): String {
        requestIpCounter += 1
        val thirdOctet = 2 + (requestIpCounter / 250)
        val fourthOctet = 1 + (requestIpCounter % 250)
        return "192.0.$thirdOctet.$fourthOctet"
    }

    private fun startRegistrationBody(
        email: String = "student@example.com",
        password: String = "River2026!",
    ): String =
        """
        {
          "email": "$email",
          "password": "$password",
          "displayName": "Student",
          "locale": "en",
          "returnTo": "https://key.play-and-say.ru/"
        }
        """.trimIndent()
}

private object RecordingKeycloakRegistrationClient : KeycloakRegistrationClient {
    val existingUsers = mutableMapOf<String, KeycloakRegistrationUser>()
    val createdUsers = mutableListOf<KeycloakUserCreateCommand>()
    val enabledUsers = mutableListOf<String>()
    val assignedRoles = mutableListOf<String>()
    val updatedPasswords = mutableMapOf<String, String>()

    fun reset() {
        existingUsers.clear()
        createdUsers.clear()
        enabledUsers.clear()
        assignedRoles.clear()
        updatedPasswords.clear()
    }

    override fun createDisabledUser(command: KeycloakUserCreateCommand): Boolean {
        if (command.email in existingUsers) {
            return false
        }
        createdUsers += command
        existingUsers[command.email] = KeycloakRegistrationUser(
            email = command.email,
            enabled = command.enabled,
            emailVerified = command.emailVerified,
        )
        return true
    }

    override fun findUserByEmail(email: String): KeycloakRegistrationUser? =
        existingUsers[email]

    override fun enableVerifiedUser(email: String) {
        enabledUsers += email
        existingUsers[email] = existingUsers[email]?.copy(enabled = true, emailVerified = true)
            ?: KeycloakRegistrationUser(email = email, enabled = true, emailVerified = true)
    }

    override fun assignRealmRole(email: String, role: String) {
        assignedRoles += role
    }

    override fun updatePassword(email: String, newPassword: String) {
        updatedPasswords[email] = newPassword
    }
}

private object RecordingRegistrationEmailClient : RegistrationEmailClient {
    val registrationConfirmations = mutableListOf<RegistrationEmailCommand>()
    val passwordResets = mutableListOf<PasswordResetEmailCommand>()

    fun reset() {
        registrationConfirmations.clear()
        passwordResets.clear()
    }

    override fun sendRegistrationConfirmation(command: RegistrationEmailCommand) {
        registrationConfirmations += command
    }

    override fun sendPasswordResetCode(command: PasswordResetEmailCommand) {
        passwordResets += command
    }
}
