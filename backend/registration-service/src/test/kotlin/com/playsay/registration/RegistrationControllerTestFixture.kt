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
import org.springframework.context.annotation.Import
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
        "playsay.registration.internal-service-token=test-internal-token",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(RegistrationControllerTestFixture.RegistrationClientTestConfig::class)
abstract class RegistrationControllerTestFixture {
    @LocalServerPort protected var port: Int = 0
    @Autowired protected lateinit var dataSource: DataSource
    @Autowired protected lateinit var pendingRegistrationRepo: PendingRegistrationRepo

    @TestConfiguration
    class RegistrationClientTestConfig {
        @Bean @Primary
        fun keycloakRegistrationClient(): KeycloakRegistrationClient = RecordingKeycloakRegistrationClient
        @Bean @Primary
        fun registrationEmailClient(): RegistrationEmailClient = RecordingRegistrationEmailClient
    }

    protected val httpClient = HttpClient.newHttpClient()
    protected var requestIpCounter = 0

    @BeforeAll
    fun migrateDatabase() = synchronized(migrationLock) {
        if (!databaseMigrated) {
            SpringLiquibase().apply {
                this.dataSource = this@RegistrationControllerTestFixture.dataSource
                changeLog = "classpath:db/changelog/db.changelog-master.xml"
            }.afterPropertiesSet()
            databaseMigrated = true
        }
    }

    @BeforeEach
    fun resetRecorders() {
        RecordingKeycloakRegistrationClient.reset()
        RecordingRegistrationEmailClient.reset()
    }

    protected fun startRegistration(
        email: String,
        password: String = "River2026!",
        forwardedFor: String? = nextForwardedFor(),
        returnTo: String? = "https://key.play-and-say.ru/",
    ): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/start"))
                .header("content-type", "application/json")
                .apply {
                    forwardedFor?.let { header("X-Forwarded-For", it) }
                }
                .POST(HttpRequest.BodyPublishers.ofString(startRegistrationBody(email, password, returnTo)))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    protected fun resendRegistration(email: String, forwardedFor: String? = nextForwardedFor()): HttpResponse<String> =
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

    protected fun confirmRegistration(token: String): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/registration/confirm"))
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"token":"$token"}"""))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    protected fun forgotPassword(email: String, forwardedFor: String? = nextForwardedFor()): HttpResponse<String> =
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

    protected fun resetPassword(
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

    protected fun provisionManagedStudent(
        username: String,
        firstName: String,
        lastName: String? = null,
        email: String? = null,
    ): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/internal/managed-students"))
                .header("X-PlaySay-Service-Token", "test-internal-token")
                .header("content-type", "application/json")
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        buildString {
                            append("{\"username\":\"$username\",\"firstName\":\"$firstName\"")
                            lastName?.let { append(",\"lastName\":\"$it\"") }
                            email?.let { append(",\"email\":\"$it\"") }
                            append("}")
                        },
                    ),
                )
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    protected fun createManagedUser(body: String): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/internal/user-management/users"))
                .header("X-PlaySay-Service-Token", "test-internal-token")
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    protected fun createManagedStudentInvite(
        subject: String,
        username: String,
        email: String?,
        displayName: String,
        lessonId: String,
        continueUrl: String,
    ): ManagedInviteFixture {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/internal/managed-student-invites"))
                .header("X-PlaySay-Service-Token", "test-internal-token")
                .header("content-type", "application/json")
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        buildString {
                            append("{\"subject\":\"$subject\",\"username\":\"$username\"")
                            email?.let { append(",\"email\":\"$it\"") }
                            append(",\"displayName\":\"$displayName\",\"lessonId\":\"$lessonId\",\"continueUrl\":\"$continueUrl\"}")
                        },
                    ),
                )
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(HttpStatus.CREATED.value(), response.statusCode(), response.body())
        return ManagedInviteFixture(
            token = Regex(""""token"\s*:\s*"([^"]+)"""").find(response.body())?.groupValues?.get(1),
        )
    }

    protected fun consumeManagedStudentInvite(token: String): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/student-invites/consume"))
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"token":"$token"}"""))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    protected fun lookupManagedStudentInvite(token: String): HttpResponse<String> =
        httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/internal/managed-student-invites/lookup"))
                .header("X-PlaySay-Service-Token", "test-internal-token")
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"token":"$token"}"""))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    protected fun lastConfirmationToken(): String =
        URI.create(RecordingRegistrationEmailClient.registrationConfirmations.last().confirmationUrl)
            .query
            .split("&")
            .single { parameter -> parameter.startsWith("token=") }
            .removePrefix("token=")

    protected fun pendingRegistration(email: String) =
        pendingRegistrationRepo.findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, "PENDING")
            ?: error("Pending registration was not saved for $email")

    protected fun nextForwardedFor(): String {
        requestIpCounter += 1
        val thirdOctet = 2 + (requestIpCounter / 250)
        val fourthOctet = 1 + (requestIpCounter % 250)
        return "192.0.$thirdOctet.$fourthOctet"
    }

    protected fun startRegistrationBody(
        email: String = "student@example.com",
        password: String = "River2026!",
        returnTo: String? = "https://key.play-and-say.ru/",
    ): String {
        val returnToLine = returnTo?.let { ",\"returnTo\":\"$it\"" } ?: ""
        return """{"email":"$email","password":"$password","displayName":"Student","locale":"en"$returnToLine}"""
    }

    protected data class ManagedInviteFixture(
        val token: String?,
    )

    private companion object {
        val migrationLock = Any()
        var databaseMigrated = false
    }
}

internal object RecordingKeycloakRegistrationClient : KeycloakRegistrationClient {
    val existingUsers = mutableMapOf<String, KeycloakRegistrationUser>()
    val createdUsers = mutableListOf<KeycloakUserCreateCommand>()
    val enabledUsers = mutableListOf<String>()
    val assignedRoles = mutableListOf<String>()
    val updatedPasswords = mutableMapOf<String, String>()
    val passwordGrantUsers = mutableListOf<String>()
    val updatedRoleSets = mutableListOf<Pair<String, Set<String>>>()
    val requiredActionEmails = mutableListOf<Pair<String, List<String>>>()
    val deletedSubjects = mutableListOf<String>()

    fun reset() {
        existingUsers.clear()
        createdUsers.clear()
        enabledUsers.clear()
        assignedRoles.clear()
        updatedPasswords.clear()
        passwordGrantUsers.clear()
        updatedRoleSets.clear()
        requiredActionEmails.clear()
        deletedSubjects.clear()
    }

    override fun createDisabledUser(command: KeycloakUserCreateCommand): Boolean {
        if (command.username in existingUsers || command.email?.let { email -> existingUsers.values.any { it.email == email } } == true) {
            return false
        }
        createdUsers += command
        existingUsers[command.username] = KeycloakRegistrationUser(
            subject = "managed-subject-${createdUsers.size}",
            username = command.username,
            email = command.email,
            enabled = command.enabled,
            emailVerified = command.emailVerified,
            managedStudent = command.managedStudent,
            displayName = listOfNotNull(command.firstName, command.lastName).joinToString(" "),
        )
        return true
    }

    override fun findUserByUsername(username: String): KeycloakRegistrationUser? =
        existingUsers[username]

    override fun findUserByEmail(email: String): KeycloakRegistrationUser? =
        existingUsers.values.firstOrNull { it.email == email }

    override fun findUserBySubject(subject: String): KeycloakRegistrationUser? =
        existingUsers.values.firstOrNull { it.subject == subject }

    override fun setRealmRoles(subject: String, roles: Set<String>) {
        updatedRoleSets += subject to roles
        val entry = existingUsers.entries.firstOrNull { it.value.subject == subject } ?: return
        entry.setValue(entry.value.copy(roles = roles))
    }

    override fun deleteUser(subject: String) {
        deletedSubjects += subject
        existingUsers.entries.removeIf { it.value.subject == subject }
    }

    override fun sendRequiredActionsEmail(subject: String, actions: List<String>) {
        requiredActionEmails += subject to actions
    }

    override fun enableVerifiedUser(username: String) {
        enabledUsers += username
        existingUsers[username] = existingUsers[username]?.copy(enabled = true, emailVerified = true)
            ?: KeycloakRegistrationUser(
                subject = "managed-subject-1",
                username = username,
                email = username.takeIf { it.contains("@") },
                enabled = true,
                emailVerified = true,
            )
    }

    override fun assignRealmRole(username: String, role: String) {
        assignedRoles += role
    }

    override fun updatePassword(username: String, newPassword: String) {
        updatedPasswords[username] = newPassword
    }

    override fun passwordGrant(username: String, password: String, clientId: String): KeycloakTokenSet {
        passwordGrantUsers += username
        return KeycloakTokenSet(
            accessToken = "access-token-${username.substringBefore("@")}",
            refreshToken = "refresh-token-${username.substringBefore("@")}",
            idToken = "id-token-${username.substringBefore("@")}",
            expiresIn = 300,
        )
    }
}

internal object RecordingRegistrationEmailClient : RegistrationEmailClient {
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
