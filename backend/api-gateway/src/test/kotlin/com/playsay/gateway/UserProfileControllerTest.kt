package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.repo.*
import com.playsay.gateway.service.*
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpStatus
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.server.ResponseStatusException
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:user-profile-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class UserProfileControllerTest @Autowired constructor(
    private val controller: UserProfileController,
    private val appUserRepo: AppUserRepo,
    private val dataSource: DataSource,
) {
    @TestConfiguration
    class ManagedStudentTestConfig {
        @Bean
        @Primary
        fun registrationGateway(): RegistrationGateway = RecordingManagedStudentRegistrationGateway
    }

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@UserProfileControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        RecordingManagedStudentRegistrationGateway.created.clear()
        appUserRepo.deleteAllInBatch()
    }

    @Test
    fun `creates and updates current app user profile`() {
        val authentication = authentication(role = "ROLE_STUDENT")

        val initial = controller.current(authentication)
        assertEquals("user-1", initial.subject)
        assertEquals("Student One", initial.displayName)
        assertNull(initial.locale)
        assertEquals("RU", initial.countryCode)

        val updated = controller.update(
            authentication,
            UpdateUserProfileRequest(
                displayName = "  Student Alpha  ",
                locale = "en",
                countryCode = " ru ",
                timezone = "Europe/Moscow",
                learningGoal = "Practice classroom speaking.",
                birthDate = LocalDate.parse("2012-04-03"),
            ),
        )

        assertEquals("Student Alpha", updated.displayName)
        assertEquals("en", updated.locale)
        assertEquals("RU", updated.countryCode)
        assertEquals("Europe/Moscow", updated.timezone)
        assertEquals("Practice classroom speaking.", updated.learningGoal)
        assertEquals(LocalDate.parse("2012-04-03"), updated.birthDate)
        assertEquals(listOf("STUDENT"), updated.roles)
    }

    @Test
    fun `delete removes editable profile fields until recreated from jwt`() {
        val authentication = authentication(role = "ROLE_STUDENT")

        val updatedWithoutCountry = controller.update(authentication, UpdateUserProfileRequest(displayName = "Custom Name"))
        assertEquals("RU", updatedWithoutCountry.countryCode)
        controller.delete(authentication)

        val recreated = controller.current(authentication)

        assertEquals("Student One", recreated.displayName)
        assertEquals("RU", recreated.countryCode)
        assertNull(recreated.learningGoal)
    }

    @Test
    fun `defaults blank country code to Russia`() {
        val authentication = authentication(role = "ROLE_STUDENT")

        val updated = controller.update(authentication, UpdateUserProfileRequest(countryCode = " "))

        assertEquals("RU", updated.countryCode)
    }

    @Test
    fun `admin can list known profiles`() {
        controller.current(authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT"))
        controller.current(authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER"))
        val admin = authentication(subject = "admin-1", username = "admin.one", role = "ROLE_ADMIN")
        controller.current(admin)

        val users = controller.list(admin)

        assertEquals(listOf("admin.one", "student.one", "teacher.one"), users.map { user -> user.username })
    }

    @Test
    fun `teacher can list known student profiles`() {
        controller.current(authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT"))
        controller.current(authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER"))
        controller.current(authentication(subject = "admin-1", username = "admin.one", role = "ROLE_ADMIN"))

        val users = controller.listStudents(authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER"))

        assertEquals(listOf("student.one"), users.map { user -> user.username })
    }

    @Test
    fun `teacher creates managed student profile before first student login`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")

        val created = controller.createManagedStudent(
            teacher,
            ManagedStudentRequest(email = "new.student@example.com", displayName = "New Student"),
        )

        assertEquals("managed-student-1", created.subject)
        assertEquals("new.student@example.com", created.email)
        assertEquals("New Student", created.displayName)
        assertEquals(listOf("STUDENT"), created.roles)
        assertEquals(true, created.managedByTeacher)
        assertEquals(listOf("new.student@example.com"), controller.listStudents(teacher).map { student -> student.email })
        assertEquals(listOf("new.student@example.com"), RecordingManagedStudentRegistrationGateway.created.map { request -> request.email })
    }

    @Test
    fun `non admin cannot list profiles`() {
        val error = assertFailsWith<ResponseStatusException> {
            controller.list(authentication(role = "ROLE_TEACHER"))
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `rejects too long profile fields`() {
        val error = assertFailsWith<ResponseStatusException> {
            controller.update(
                authentication(role = "ROLE_STUDENT"),
                UpdateUserProfileRequest(displayName = "x".repeat(121), countryCode = "RUS"),
            )
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    @Test
    fun `rejects malformed country code`() {
        val error = assertFailsWith<ResponseStatusException> {
            controller.update(
                authentication(role = "ROLE_STUDENT"),
                UpdateUserProfileRequest(countryCode = "R1"),
            )
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    @Test
    fun `rejects a future birth date`() {
        val error = assertFailsWith<ResponseStatusException> {
            controller.update(
                authentication(role = "ROLE_STUDENT"),
                UpdateUserProfileRequest(birthDate = LocalDate.now().plusDays(1)),
            )
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    private fun authentication(
        subject: String = "user-1",
        username: String = "student.one",
        role: String,
    ): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token-$subject")
            .header("alg", "none")
            .subject(subject)
            .claim("preferred_username", username)
            .claim("email", "$username@example.com")
            .claim("name", "Student One")
            .build()

        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(role)))
    }
}

private object RecordingManagedStudentRegistrationGateway : RegistrationGateway {
    val created = mutableListOf<ManagedStudentRequest>()

    override fun start(request: StartRegistrationRequest, clientAddress: String?): RegistrationResponse =
        RegistrationResponse(status = "CHECK_EMAIL")

    override fun resend(request: ResendRegistrationRequest, clientAddress: String?): RegistrationResponse =
        RegistrationResponse(status = "CHECK_EMAIL")

    override fun confirm(request: ConfirmRegistrationRequest): RegistrationResponse =
        RegistrationResponse(status = "CONFIRMED")

    override fun forgotPassword(request: ForgotPasswordRequest, clientAddress: String?): RegistrationResponse =
        RegistrationResponse(status = "CHECK_EMAIL")

    override fun resetPassword(request: ResetPasswordRequest, clientAddress: String?): RegistrationResponse =
        RegistrationResponse(status = "PASSWORD_RESET")

    override fun createManagedStudent(request: ManagedStudentRequest): ManagedStudentProvisionResponse {
        created += request
        return ManagedStudentProvisionResponse(
            subject = "managed-student-1",
            email = request.email,
            displayName = request.displayName,
        )
    }

    override fun createManagedStudentInvite(request: ManagedStudentInviteRequest): ManagedStudentInviteResponse =
        error("Managed student invite creation is not used in this test.")

    override fun lookupManagedStudentInvite(
        request: StudentInviteConsumeRequest,
        clientAddress: String?,
    ): ManagedStudentInviteLookupResponse =
        error("Student invite lookup is not used in this test.")

    override fun consumeStudentInvite(request: StudentInviteConsumeRequest, clientAddress: String?): StudentInviteConsumeResponse =
        error("Student invite consume is not used in this test.")
}
