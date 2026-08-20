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

class RegistrationUserManagementControllerTest : RegistrationControllerTestFixture() {
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
                .startsWith("https://dev.online.honey.school/register/confirm?token="),
        )

        val confirmed = confirmRegistration(lastConfirmationToken())

        assertEquals(HttpStatus.OK.value(), confirmed.statusCode(), confirmed.body())
        assertTrue(confirmed.body().contains("CONFIRMED"))
        assertEquals("student@example.com", RecordingKeycloakRegistrationClient.enabledUsers.single())
        assertEquals("STUDENT", RecordingKeycloakRegistrationClient.assignedRoles.single())
    }

    @Test
    fun `managed student provisioning creates enabled keycloak student`() {
        val response = provisionManagedStudent("managed.student", "Managed", "Student", "managed@example.com")

        assertEquals(HttpStatus.CREATED.value(), response.statusCode(), response.body())
        assertTrue(response.body().contains("managed-subject-1"))
        val createdUser = RecordingKeycloakRegistrationClient.createdUsers.single()
        assertEquals("managed.student", createdUser.username)
        assertEquals("managed@example.com", createdUser.email)
        assertEquals("Managed", createdUser.firstName)
        assertEquals("Student", createdUser.lastName)
        assertTrue(createdUser.enabled)
        assertTrue(createdUser.emailVerified)
        assertTrue(createdUser.managedStudent)
        assertEquals("STUDENT", RecordingKeycloakRegistrationClient.assignedRoles.single())
    }

    @Test
    fun `managed student provisioning normalizes username and allows missing email and last name`() {
        val response = provisionManagedStudent("Young.Learner", "Mia")

        assertEquals(HttpStatus.CREATED.value(), response.statusCode(), response.body())
        val createdUser = RecordingKeycloakRegistrationClient.createdUsers.single()
        assertEquals("young.learner", createdUser.username)
        assertEquals(null, createdUser.email)
        assertEquals("Mia", createdUser.firstName)
        assertEquals(null, createdUser.lastName)
        assertFalse(createdUser.emailVerified)
        assertTrue(response.body().contains("young.learner"))
        assertTrue(response.body().contains("Mia"))
    }

    @Test
    fun `internal user management invites admin teacher staff with temporary credentials`() {
        val response = createManagedUser(
            """{"username":"staff.one","firstName":"Staff","lastName":"One","email":"staff@example.com","roles":["ADMIN","TEACHER"],"managedStudent":false}""",
        )

        assertEquals(HttpStatus.CREATED.value(), response.statusCode(), response.body())
        assertTrue(response.body().contains("ADMIN"))
        assertTrue(response.body().contains("TEACHER"))
        val created = RecordingKeycloakRegistrationClient.createdUsers.single()
        assertTrue(created.temporaryPassword)
        assertEquals(listOf("VERIFY_EMAIL", "UPDATE_PASSWORD"), created.requiredActions)
        assertEquals(setOf("ADMIN", "TEACHER"), RecordingKeycloakRegistrationClient.updatedRoleSets.single().second)
        assertEquals(listOf("VERIFY_EMAIL", "UPDATE_PASSWORD"), RecordingKeycloakRegistrationClient.requiredActionEmails.single().second)
    }

    @Test
    fun `internal user management rejects mixed student role and staff without email`() {
        val mixedRoles = createManagedUser(
            """{"username":"mixed.user","firstName":"Mixed","email":"mixed@example.com","roles":["STUDENT","TEACHER"],"managedStudent":false}""",
        )
        val staffWithoutEmail = createManagedUser(
            """{"username":"staff.noemail","firstName":"Staff","roles":["TEACHER"],"managedStudent":false}""",
        )

        assertEquals(HttpStatus.BAD_REQUEST.value(), mixedRoles.statusCode(), mixedRoles.body())
        assertEquals(HttpStatus.BAD_REQUEST.value(), staffWithoutEmail.statusCode(), staffWithoutEmail.body())
        assertTrue(RecordingKeycloakRegistrationClient.createdUsers.isEmpty())
    }

    @Test
    fun `internal user management rejects missing service token`() {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/api/internal/user-management/users/exact?identifier=student"))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(HttpStatus.UNAUTHORIZED.value(), response.statusCode())
    }

    @Test
    fun `managed student provisioning rejects invalid or occupied identity`() {
        val invalid = provisionManagedStudent("bad login", "Mia")
        assertEquals(HttpStatus.BAD_REQUEST.value(), invalid.statusCode(), invalid.body())

        RecordingKeycloakRegistrationClient.existingUsers["occupied"] = KeycloakRegistrationUser(
            subject = "regular-subject",
            username = "occupied",
            email = "owner@example.com",
            enabled = true,
            emailVerified = true,
        )
        val occupiedUsername = provisionManagedStudent("occupied", "Mia")
        val occupiedEmail = provisionManagedStudent("available", "Mia", email = "owner@example.com")

        assertEquals(HttpStatus.CONFLICT.value(), occupiedUsername.statusCode(), occupiedUsername.body())
        assertEquals(HttpStatus.CONFLICT.value(), occupiedEmail.statusCode(), occupiedEmail.body())
    }

    @Test
    fun `managed student provisioning is idempotent by normalized username`() {
        val first = provisionManagedStudent("Repeat.Student", "Repeat", email = "repeat@example.com")
        val second = provisionManagedStudent("repeat.student", "Repeat", email = "repeat@example.com")

        assertEquals(HttpStatus.CREATED.value(), first.statusCode(), first.body())
        assertEquals(HttpStatus.CREATED.value(), second.statusCode(), second.body())
        assertEquals(1, RecordingKeycloakRegistrationClient.createdUsers.size)
        assertTrue(second.body().contains("managed-subject-1"))
    }

    @Test
    fun `managed student invite is one time and returns keycloak tokens`() {
        provisionManagedStudent("invitee", "Invitee")
        val invite = createManagedStudentInvite(
            subject = "managed-subject-1",
            username = "invitee",
            email = null,
            displayName = "Invitee",
            lessonId = "3f20a6e4-a861-49ab-aa70-8300b589f61f",
            continueUrl = "https://dev.online.honey.school/lessons/3f20a6e4-a861-49ab-aa70-8300b589f61f/classroom",
        )
        val token = assertNotNull(invite.token)

        val consumed = consumeManagedStudentInvite(token)
        val repeated = consumeManagedStudentInvite(token)
        val manualInvite = createManagedStudentInvite(
            subject = "managed-subject-1",
            username = "invitee",
            email = null,
            displayName = "Invitee",
            lessonId = "3f20a6e4-a861-49ab-aa70-8300b589f61f",
            continueUrl = "https://dev.online.honey.school/lessons/3f20a6e4-a861-49ab-aa70-8300b589f61f/classroom",
        )
        val manualToken = assertNotNull(manualInvite.token)
        val manualEntry = "${manualToken.substring(0, 3).lowercase()} ${manualToken.substring(3).lowercase()}"
        val manualConsumed = consumeManagedStudentInvite(manualEntry)

        assertTrue(Regex("^[A-Z0-9]{6}$").matches(token))
        assertTrue(Regex("^[A-Z0-9]{6}$").matches(manualToken))
        assertEquals(HttpStatus.OK.value(), consumed.statusCode(), consumed.body())
        assertEquals(HttpStatus.OK.value(), manualConsumed.statusCode(), manualConsumed.body())
        assertTrue(consumed.body().contains("access-token-invitee"))
        assertTrue(consumed.body().contains("https://dev.online.honey.school/lessons/3f20a6e4-a861-49ab-aa70-8300b589f61f/classroom"))
        assertEquals(HttpStatus.BAD_REQUEST.value(), repeated.statusCode(), repeated.body())
        assertEquals(
            listOf("invitee", "invitee"),
            RecordingKeycloakRegistrationClient.passwordGrantUsers,
        )
    }

    @Test
    fun `managed student invite lookup is pending metadata only and does not consume code`() {
        provisionManagedStudent("lookup.student", "Lookup", "Student", "lookup@example.com")
        val lessonId = "37a6f61a-434f-483d-9177-f4b2f6fcdca5"
        val continueUrl = "https://dev.online.honey.school/lessons/$lessonId/classroom"
        val invite = createManagedStudentInvite(
            subject = "managed-subject-1",
            username = "lookup.student",
            email = "lookup@example.com",
            displayName = "Lookup Student",
            lessonId = lessonId,
            continueUrl = continueUrl,
        )
        val token = assertNotNull(invite.token)

        val lookup = lookupManagedStudentInvite(token)
        val consumed = consumeManagedStudentInvite(token)

        assertEquals(HttpStatus.OK.value(), lookup.statusCode(), lookup.body())
        assertTrue(lookup.body().contains("managed-subject-1"))
        assertTrue(lookup.body().contains(lessonId))
        assertTrue(lookup.body().contains(continueUrl))
        assertEquals(HttpStatus.OK.value(), consumed.statusCode(), consumed.body())
        assertTrue(consumed.body().contains("access-token-lookup"))
    }

    @Test
    fun `managed student invite lookup repository query does not require a write lock`() {
        val lookupMethod = ManagedStudentInviteRepo::class.java.getMethod(
            "findPendingLookupByTokenHashAndStatus",
            String::class.java,
            String::class.java,
        )

        assertEquals(null, lookupMethod.getAnnotation(Lock::class.java))
    }

    @Test
    fun `managed student invite migration adds required username and makes email optional`() {
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                select column_name, is_nullable
                from information_schema.columns
                where table_name = 'managed_student_invites'
                  and column_name in ('username_normalized', 'email_normalized')
                """.trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    val nullability = buildMap {
                        while (rows.next()) {
                            put(rows.getString("column_name"), rows.getString("is_nullable"))
                        }
                    }
                    assertEquals("NO", nullability["username_normalized"])
                    assertEquals("YES", nullability["email_normalized"])
                }
            }
        }
    }

}
