package com.playsay.registration

import com.playsay.registration.service.KeycloakRegistrationClient
import com.playsay.registration.service.KeycloakUserCreateCommand
import com.playsay.registration.repo.PendingRegistrationRepo
import com.playsay.registration.service.RegistrationEmailClient
import com.playsay.registration.service.RegistrationEmailCommand
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
        RecordingRegistrationEmailClient.sent.clear()
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
        assertTrue(RecordingRegistrationEmailClient.sent.single().confirmationUrl.startsWith("https://online.play-and-say.ru/register/confirm?token="))

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
        RecordingKeycloakRegistrationClient.existingEmails += email

        val response = startRegistration(email)

        assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
        assertTrue(response.body().contains("CHECK_EMAIL"))
        assertTrue(RecordingKeycloakRegistrationClient.createdUsers.isEmpty())
        assertTrue(RecordingRegistrationEmailClient.sent.isEmpty())
        assertTrue(
            pendingRegistrationRepo.findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, "PENDING") == null,
        )
    }

    @Test
    fun `resend respects cooldown and sends a new token after cooldown`() {
        val email = "resend@example.com"
        val started = startRegistration(email)

        assertEquals(HttpStatus.ACCEPTED.value(), started.statusCode())
        assertEquals(1, RecordingRegistrationEmailClient.sent.size)
        val firstConfirmationUrl = RecordingRegistrationEmailClient.sent.single().confirmationUrl

        val throttled = resendRegistration(email)
        assertEquals(HttpStatus.ACCEPTED.value(), throttled.statusCode())
        assertEquals(1, RecordingRegistrationEmailClient.sent.size)

        val pending = pendingRegistration(email)
        pending.emailSentAt = Instant.EPOCH
        pending.updatedAt = Instant.EPOCH
        pendingRegistrationRepo.saveAndFlush(pending)

        val resent = resendRegistration(email)
        assertEquals(HttpStatus.ACCEPTED.value(), resent.statusCode())
        assertEquals(2, RecordingRegistrationEmailClient.sent.size)
        assertTrue(RecordingRegistrationEmailClient.sent.last().confirmationUrl != firstConfirmationUrl)
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

        repeat(5) {
            val response = startRegistration(email)
            assertEquals(HttpStatus.ACCEPTED.value(), response.statusCode(), response.body())
            assertTrue(response.body().contains("CHECK_EMAIL"))
        }

        val limited = startRegistration(email)
        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), limited.statusCode())
    }

    private fun startRegistration(email: String): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/start"))
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(startRegistrationBody(email)))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun resendRegistration(email: String): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/resend"))
                .header("content-type", "application/json")
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

    private fun lastConfirmationToken(): String =
        URI.create(RecordingRegistrationEmailClient.sent.last().confirmationUrl)
            .query
            .split("&")
            .single { parameter -> parameter.startsWith("token=") }
            .removePrefix("token=")

    private fun pendingRegistration(email: String) =
        pendingRegistrationRepo.findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, "PENDING")
            ?: error("Pending registration was not saved for $email")

    private fun startRegistrationBody(email: String = "student@example.com"): String =
        """
        {
          "email": "$email",
          "password": "correct horse battery staple",
          "displayName": "Student",
          "locale": "en",
          "returnTo": "https://key.play-and-say.ru/"
        }
        """.trimIndent()
}

private object RecordingKeycloakRegistrationClient : KeycloakRegistrationClient {
    val existingEmails = mutableSetOf<String>()
    val createdUsers = mutableListOf<KeycloakUserCreateCommand>()
    val enabledUsers = mutableListOf<String>()
    val assignedRoles = mutableListOf<String>()

    fun reset() {
        existingEmails.clear()
        createdUsers.clear()
        enabledUsers.clear()
        assignedRoles.clear()
    }

    override fun createDisabledUser(command: KeycloakUserCreateCommand): Boolean {
        if (command.email in existingEmails) {
            return false
        }
        createdUsers += command
        return true
    }

    override fun enableVerifiedUser(email: String) {
        enabledUsers += email
    }

    override fun assignRealmRole(email: String, role: String) {
        assignedRoles += role
    }
}

private object RecordingRegistrationEmailClient : RegistrationEmailClient {
    val sent = mutableListOf<RegistrationEmailCommand>()

    override fun sendRegistrationConfirmation(command: RegistrationEmailCommand) {
        sent += command
    }
}
