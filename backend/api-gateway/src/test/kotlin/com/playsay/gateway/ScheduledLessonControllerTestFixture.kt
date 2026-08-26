package com.playsay.gateway
import com.playsay.gateway.client.LessonReminderEmailClient
import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.client.LessonReminderEmailCommand

import com.playsay.contract.registration.model.ManagedStudentInviteLookupResponse
import com.playsay.contract.registration.model.ManagedStudentInviteRequest
import com.playsay.contract.registration.model.ManagedStudentInviteResponse
import com.playsay.contract.registration.model.ManagedStudentResponse
import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.StudentProfileEntity
import com.playsay.gateway.entity.TeacherDelegationEntity
import com.playsay.gateway.entity.TeacherDelegationStudentEntity
import com.playsay.gateway.repo.*
import com.playsay.gateway.repo.schedule.*
import com.playsay.gateway.service.*
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import java.util.Base64
import java.util.Date
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.context.annotation.Import
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.server.ResponseStatusException
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:scheduled-lesson-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=false",
        "playsay.livekit.url=wss://online.play-and-say.ru/livekit",
        "playsay.livekit.api-key=test-key",
        "playsay.livekit.api-secret=01234567890123456789012345678901",
        "playsay.livekit.token-ttl-seconds=900",
        "playsay.lesson-access.enabled=true",
        "playsay.lesson-access.hmac-secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "playsay.lesson-access.environment-issuer=https://dev.ops.honey.school/keycloak/realms/playsay",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(ScheduledLessonControllerTestFixture.LessonReminderTestConfig::class)
abstract class ScheduledLessonControllerTestFixture {
    @Autowired protected lateinit var scheduleController: ScheduledLessonController
    @Autowired protected lateinit var studentInviteController: StudentInviteController
    @Autowired protected lateinit var liveKitRoomController: LiveKitRoomController
    @Autowired protected lateinit var liveKitWebhookController: LiveKitWebhookController
    @Autowired protected lateinit var courseController: CourseController
    @Autowired protected lateinit var materialCrudController: MaterialCrudController
    @Autowired protected lateinit var userProfileStore: UserProfileStore
    @Autowired protected lateinit var lessonParticipantRepo: LessonParticipantRepo
    @Autowired protected lateinit var lessonRepo: LessonRepo
    @Autowired protected lateinit var lessonEmailReminderRepo: LessonEmailReminderRepo
    @Autowired protected lateinit var lessonEmailChallengeRepo: LessonEmailChallengeRepo
    @Autowired protected lateinit var lessonEntryAttemptRepo: LessonEntryAttemptRepo
    @Autowired protected lateinit var lessonAdmissionRepo: LessonAdmissionRepo
    @Autowired protected lateinit var lessonAccessLinkRepo: LessonAccessLinkRepo
    @Autowired protected lateinit var lessonAccessAuditRepo: LessonAccessAuditRepo
    @Autowired protected lateinit var lessonChallengeRateLimitRepo: LessonChallengeRateLimitRepo
    @Autowired protected lateinit var lessonReminderScheduler: LessonReminderScheduler
    @Autowired protected lateinit var lessonTemplateRepo: LessonTemplateRepo
    @Autowired protected lateinit var courseRepo: CourseRepo
    @Autowired protected lateinit var lessonMaterialRepo: LessonMaterialRepo
    @Autowired protected lateinit var appUserRepo: AppUserRepo
    @Autowired protected lateinit var studentProfileRepo: StudentProfileRepo
    @Autowired protected lateinit var teacherDelegationRepo: TeacherDelegationRepo
    @Autowired protected lateinit var teacherDelegationStudentRepo: TeacherDelegationStudentRepo
    @Autowired protected lateinit var userManagementAuditRepo: UserManagementAuditRepo
    @Autowired protected lateinit var dataSource: DataSource

    @TestConfiguration
    class LessonReminderTestConfig {
        @Bean @Primary
        fun lessonReminderEmailClient(): LessonReminderEmailClient = RecordingLessonReminderEmailClient
        @Bean @Primary
        fun registrationGateway(): RegistrationGateway = RecordingScheduledLessonRegistrationGateway
    }

    @BeforeAll
    fun migrateDatabase() = synchronized(migrationLock) {
        if (!databaseMigrated) {
            SpringLiquibase().apply {
                this.dataSource = this@ScheduledLessonControllerTestFixture.dataSource
                changeLog = "classpath:db/changelog/db.changelog-master.xml"
            }.afterPropertiesSet()
            databaseMigrated = true
        }
    }

    @BeforeEach
    fun cleanDatabase() {
        RecordingLessonReminderEmailClient.sent.clear()
        RecordingLessonReminderEmailClient.failFor = null
        RecordingScheduledLessonRegistrationGateway.reset()
        lessonEmailChallengeRepo.deleteAllInBatch()
        lessonEntryAttemptRepo.deleteAllInBatch()
        lessonAdmissionRepo.deleteAllInBatch()
        lessonAccessLinkRepo.deleteAllInBatch()
        lessonAccessAuditRepo.deleteAllInBatch()
        lessonChallengeRateLimitRepo.deleteAllInBatch()
        lessonEmailReminderRepo.deleteAllInBatch()
        lessonParticipantRepo.deleteAllInBatch()
        lessonRepo.deleteAllInBatch()
        lessonTemplateRepo.deleteAllInBatch()
        courseRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        teacherDelegationStudentRepo.deleteAllInBatch()
        teacherDelegationRepo.deleteAllInBatch()
        userManagementAuditRepo.deleteAllInBatch()
        studentProfileRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
        appUserRepo.seedPrimaryTeacherWithStudents()
    }

    protected fun courseLessonId(teacher: JwtAuthenticationToken): UUID {
        val course = courseController.create(teacher, CourseRequest(title = "Course", isPublished = true)).body!!
        return courseController.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "Lesson", orderIndex = 1, plannedDurationMin = 45),
        ).body!!.id
    }

    protected fun authentication(
        subject: String,
        username: String,
        role: String,
        vararg additionalRoles: String,
    ): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token-$subject")
            .header("alg", "none")
            .subject(subject)
            .claim("preferred_username", username)
            .claim("email", "$username@example.com")
            .claim("name", username.replace(".", " ").replaceFirstChar { char -> char.uppercase() })
            .build()

        return JwtAuthenticationToken(jwt, (listOf(role) + additionalRoles).map(::SimpleGrantedAuthority))
    }

    protected fun webhookBody(event: String, roomName: String, identity: String, createdAt: Instant): String =
        """
        {"id":"event-1","createdAt":${createdAt.epochSecond},"event":"$event","room":{"name":"$roomName"},"participant":{"identity":"$identity"}}
        """.trimIndent()

    protected fun webhookAuthorization(body: String): String {
        val hash = Base64.getEncoder().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(body.toByteArray(StandardCharsets.UTF_8)),
        )
        val claims = JWTClaimsSet.Builder()
            .issuer("test-key")
            .claim("sha256", hash)
            .expirationTime(Date.from(Instant.now().plusSeconds(60)))
            .build()
        val jwt = SignedJWT(JWSHeader.Builder(JWSAlgorithm.HS256).build(), claims)
        jwt.sign(MACSigner("01234567890123456789012345678901".toByteArray(StandardCharsets.UTF_8)))
        return "Bearer ${jwt.serialize()}"
    }

    protected fun attendanceRow(lessonId: UUID): AttendanceRow =
        lessonRepo.findById(lessonId).orElseThrow().let { lesson ->
            val participant = lessonParticipantRepo.findByLessonId(lessonId).single()
            AttendanceRow(
                status = lesson.status,
                actualStart = lesson.actualStart,
                joinedAt = participant.joinedAt,
                leftAt = participant.leftAt,
                attendanceStatus = participant.attendanceStatus,
            )
        }

    protected fun futureStart(minutesFromNow: Long): Instant =
        Instant.now().plusSeconds(minutesFromNow * 60)

    protected fun futureEnd(minutesFromNow: Long): Instant =
        Instant.now().plusSeconds((minutesFromNow + 45) * 60)

    protected fun futureWeekdayStart(dayOfWeek: DayOfWeek, time: LocalTime = LocalTime.of(10, 0)): Instant =
        LocalDate.now(ZoneOffset.UTC)
            .plusDays(1)
            .with(TemporalAdjusters.nextOrSame(dayOfWeek))
            .atTime(time)
            .toInstant(ZoneOffset.UTC)

    protected data class AttendanceRow(
        val status: String,
        val actualStart: Instant?,
        val joinedAt: Instant?,
        val leftAt: Instant?,
        val attendanceStatus: String?,
    )

    private companion object {
        val migrationLock = Any()
        var databaseMigrated = false
    }
}

internal object RecordingLessonReminderEmailClient : LessonReminderEmailClient {
    val sent = mutableListOf<LessonReminderEmailCommand>()
    var failFor: String? = null

    override fun send(command: LessonReminderEmailCommand) {
        if (command.to == failFor) {
            error("simulated email provider failure")
        }
        sent += command
    }
}

internal object RecordingScheduledLessonRegistrationGateway : RegistrationGateway {
    val invites = mutableListOf<ManagedStudentInviteRequest>()
    val lookups = mutableListOf<StudentInviteConsumeRequest>()
    val consumes = mutableListOf<StudentInviteConsumeRequest>()
    var lookupResponse: ManagedStudentInviteLookupResponse? = null

    fun reset() {
        invites.clear()
        lookups.clear()
        consumes.clear()
        lookupResponse = null
    }

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

    override fun createManagedStudent(request: ManagedStudentRequest): ManagedStudentResponse =
        ManagedStudentResponse(
            subject = "managed-student-1",
            username = request.username,
            email = request.email,
            firstName = request.firstName,
            lastName = request.lastName,
            displayName = listOfNotNull(request.firstName, request.lastName).joinToString(" "),
        )

    override fun createManagedStudentInvite(request: ManagedStudentInviteRequest): ManagedStudentInviteResponse {
        invites += request
        return ManagedStudentInviteResponse(token = "A7K2Q9", expiresAt = Instant.parse("2026-05-25T09:55:00Z"))
    }

    override fun lookupManagedStudentInvite(
        request: StudentInviteConsumeRequest,
        clientAddress: String?,
    ): ManagedStudentInviteLookupResponse {
        lookups += request
        return lookupResponse ?: error("Student invite lookup response was not configured.")
    }

    override fun consumeStudentInvite(request: StudentInviteConsumeRequest, clientAddress: String?): StudentInviteConsumeResponse {
        consumes += request
        return StudentInviteConsumeResponse(
            status = "AUTHENTICATED",
            accessToken = "access-token",
            refreshToken = "refresh-token",
            idToken = "id-token",
            expiresIn = 300,
            continueUrl = "/lessons/lesson-id/classroom",
        )
    }
}
