package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.repo.*
import com.playsay.gateway.service.*
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.Date
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpStatus
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.server.ResponseStatusException
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:scheduled-lesson-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.livekit.url=wss://online.play-and-say.ru/livekit",
        "playsay.livekit.api-key=test-key",
        "playsay.livekit.api-secret=01234567890123456789012345678901",
        "playsay.livekit.token-ttl-seconds=900",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ScheduledLessonControllerTest @Autowired constructor(
    private val scheduleController: ScheduledLessonController,
    private val liveKitRoomController: LiveKitRoomController,
    private val liveKitWebhookController: LiveKitWebhookController,
    private val courseController: CourseController,
    private val materialController: MaterialController,
    private val userProfileStore: UserProfileStore,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonRepo: LessonRepo,
    private val lessonTemplateRepo: LessonTemplateRepo,
    private val courseRepo: CourseRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val appUserRepo: AppUserRepo,
    private val dataSource: DataSource,
) {
    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@ScheduledLessonControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        lessonParticipantRepo.deleteAllInBatch()
        lessonRepo.deleteAllInBatch()
        lessonTemplateRepo.deleteAllInBatch()
        courseRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
    }

    @Test
    fun `teacher schedules lesson with participant`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lessonTemplateId = courseLessonId(teacher)

        val created = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = Instant.parse("2026-05-25T10:00:00Z"),
                scheduledEnd = Instant.parse("2026-05-25T10:45:00Z"),
                type = "GROUP",
                participantSubjects = listOf("student-1"),
            ),
        ).body

        assertNotNull(created)
        assertEquals(HttpStatus.CREATED, scheduleController.create(teacher, ScheduledLessonRequest()).statusCode)
        assertEquals("SCHEDULED", created.status)
        assertEquals("lesson-${created.id}", created.livekitRoomName)
        assertEquals(listOf("student-1"), created.participants.map { participant -> participant.subject })
        assertEquals(2, scheduleController.list(teacher).size)
    }

    @Test
    fun `student sees only own scheduled lessons`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val otherStudent = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        userProfileStore.currentUserId(otherStudent)
        val lessonTemplateId = courseLessonId(teacher)

        val ownLesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = futureStart(120),
                scheduledEnd = futureEnd(120),
                participantSubjects = listOf("student-2"),
            ),
        )

        assertEquals(listOf(ownLesson.id), scheduleController.list(student).map { lesson -> lesson.id })
    }

    @Test
    fun `student does not see cancelled completed or expired scheduled lessons`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lessonTemplateId = courseLessonId(teacher)

        scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = Instant.now().minusSeconds(7200),
                scheduledEnd = Instant.now().minusSeconds(3600),
                participantSubjects = listOf("student-1"),
            ),
        )
        scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = futureStart(90),
                scheduledEnd = futureEnd(90),
                status = "CANCELLED",
                participantSubjects = listOf("student-1"),
            ),
        )
        val visibleLesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = futureStart(120),
                scheduledEnd = futureEnd(120),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        assertEquals(listOf(visibleLesson.id), scheduleController.list(student).map { lesson -> lesson.id })
        assertEquals(3, scheduleController.list(teacher).size)
    }

    @Test
    fun `student cannot create scheduled lesson`() {
        val error = assertFailsWith<ResponseStatusException> {
            scheduleController.create(
                authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT"),
                ScheduledLessonRequest(),
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `rejects invalid schedule payload`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")

        val error = assertFailsWith<ResponseStatusException> {
            scheduleController.create(
                teacher,
                ScheduledLessonRequest(
                    scheduledStart = Instant.parse("2026-05-25T10:45:00Z"),
                    scheduledEnd = Instant.parse("2026-05-25T10:00:00Z"),
                ),
            )
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    @Test
    fun `teacher updates scheduled lesson with the same participant`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lessonTemplateId = courseLessonId(teacher)

        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val updated = scheduleController.update(
            teacher,
            lesson.id,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = futureStart(90),
                scheduledEnd = futureEnd(90),
                status = "CANCELLED",
                participantSubjects = listOf("student-1"),
            ),
        )

        assertEquals("CANCELLED", updated.status)
        assertEquals(listOf("student-1"), updated.participants.map { participant -> participant.subject })
    }

    @Test
    fun `teacher updates and deletes scheduled lesson`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.parse("2026-05-25T10:00:00Z"),
                scheduledEnd = Instant.parse("2026-05-25T10:45:00Z"),
            ),
        ).body!!

        val updated = scheduleController.update(
            teacher,
            lesson.id,
            ScheduledLessonRequest(
                scheduledStart = Instant.parse("2026-05-25T12:00:00Z"),
                scheduledEnd = Instant.parse("2026-05-25T12:45:00Z"),
                status = "IN_PROGRESS",
                type = "INDIVIDUAL",
            ),
        )

        assertEquals("IN_PROGRESS", updated.status)
        assertEquals("INDIVIDUAL", updated.type)

        assertEquals(HttpStatus.NO_CONTENT, scheduleController.delete(teacher, lesson.id).statusCode)
        assertEquals(emptyList(), scheduleController.list(teacher))
    }

    @Test
    fun `scheduled lesson uses direct material before template material and inherits template material when direct is absent`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val templateMaterial = materialController.create(
            teacher,
            LessonMaterialRequest(title = "Template material", status = "PUBLISHED"),
        ).body!!
        val directMaterial = materialController.create(
            teacher,
            LessonMaterialRequest(title = "Direct material", status = "PUBLISHED"),
        ).body!!
        val course = courseController.create(teacher, CourseRequest(title = "Course", isPublished = true)).body!!
        val lessonTemplate = courseController.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "Lesson", materialId = templateMaterial.id),
        ).body!!

        val inherited = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplate.id,
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        val direct = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplate.id,
                materialId = directMaterial.id,
                scheduledStart = futureStart(120),
                scheduledEnd = futureEnd(120),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        assertEquals(templateMaterial.id, inherited.materialId)
        assertEquals("Template material", inherited.materialTitle)
        assertEquals(directMaterial.id, direct.materialId)
        assertEquals("Direct material", direct.materialTitle)
        assertEquals(directMaterial.id, scheduleController.get(student, direct.id).materialId)
    }

    @Test
    fun `teacher and participant receive LiveKit room token`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val teacherToken = liveKitRoomController.createToken(teacher, lesson.id)
        val studentToken = liveKitRoomController.createToken(student, lesson.id)
        val claims = SignedJWT.parse(teacherToken.token).jwtClaimsSet
        val videoGrant = claims.getJSONObjectClaim("video")

        assertEquals("wss://online.play-and-say.ru/livekit", teacherToken.serverUrl)
        assertEquals("lesson-${lesson.id}", teacherToken.roomName)
        assertEquals("teacher-1", teacherToken.identity)
        assertEquals("lesson-${lesson.id}", studentToken.roomName)
        assertEquals("test-key", claims.issuer)
        assertEquals("teacher-1", claims.subject)
        assertEquals("lesson-${lesson.id}", videoGrant["room"])
        assertEquals(true, videoGrant["roomJoin"])
        assertEquals(true, videoGrant["canPublish"])
        assertEquals(true, videoGrant["canSubscribe"])
    }

    @Test
    fun `non participant cannot receive LiveKit room token`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val otherStudent = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        userProfileStore.currentUserId(otherStudent)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val error = assertFailsWith<ResponseStatusException> {
            liveKitRoomController.createToken(otherStudent, lesson.id)
        }

        assertEquals(HttpStatus.NOT_FOUND, error.statusCode)
    }

    @Test
    fun `expired scheduled lesson does not issue LiveKit room token`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.now().minusSeconds(7200),
                scheduledEnd = Instant.now().minusSeconds(3600),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val teacherError = assertFailsWith<ResponseStatusException> {
            liveKitRoomController.createToken(teacher, lesson.id)
        }
        val studentError = assertFailsWith<ResponseStatusException> {
            liveKitRoomController.createToken(student, lesson.id)
        }

        assertEquals(HttpStatus.NOT_FOUND, teacherError.statusCode)
        assertEquals(HttpStatus.NOT_FOUND, studentError.statusCode)
    }

    @Test
    fun `LiveKit webhook marks participant attendance`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.parse("2026-05-25T10:00:00Z"),
                scheduledEnd = Instant.parse("2026-05-25T10:45:00Z"),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        val joinedAt = Instant.parse("2026-05-25T10:05:00Z")
        val leftAt = Instant.parse("2026-05-25T10:40:00Z")
        val joinedBody = webhookBody("participant_joined", lesson.livekitRoomName!!, "student-1", joinedAt)
        val leftBody = webhookBody("participant_left", lesson.livekitRoomName!!, "student-1", leftAt)

        assertEquals(HttpStatus.NO_CONTENT, liveKitWebhookController.receive(joinedBody, webhookAuthorization(joinedBody)).statusCode)
        assertEquals(HttpStatus.NO_CONTENT, liveKitWebhookController.receive(leftBody, webhookAuthorization(leftBody)).statusCode)

        val attendance = attendanceRow(lesson.id)
        assertEquals("IN_PROGRESS", attendance.status)
        assertEquals(joinedAt, attendance.actualStart)
        assertEquals(joinedAt, attendance.joinedAt)
        assertEquals(leftAt, attendance.leftAt)
        assertEquals("PRESENT", attendance.attendanceStatus)
    }

    @Test
    fun `LiveKit webhook rejects invalid signature`() {
        val body = webhookBody("participant_joined", "lesson-1", "student-1", Instant.parse("2026-05-25T10:05:00Z"))

        val error = assertFailsWith<ResponseStatusException> {
            liveKitWebhookController.receive(body, "Bearer invalid")
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    private fun courseLessonId(teacher: JwtAuthenticationToken): UUID {
        val course = courseController.create(teacher, CourseRequest(title = "Course", isPublished = true)).body!!
        return courseController.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "Lesson", orderIndex = 1, plannedDurationMin = 45),
        ).body!!.id
    }

    private fun authentication(
        subject: String,
        username: String,
        role: String,
    ): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token-$subject")
            .header("alg", "none")
            .subject(subject)
            .claim("preferred_username", username)
            .claim("email", "$username@example.com")
            .claim("name", username.replace(".", " ").replaceFirstChar { char -> char.uppercase() })
            .build()

        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(role)))
    }

    private fun webhookBody(event: String, roomName: String, identity: String, createdAt: Instant): String =
        """
        {"id":"event-1","createdAt":${createdAt.epochSecond},"event":"$event","room":{"name":"$roomName"},"participant":{"identity":"$identity"}}
        """.trimIndent()

    private fun webhookAuthorization(body: String): String {
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

    private fun attendanceRow(lessonId: UUID): AttendanceRow =
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

    private fun futureStart(minutesFromNow: Long): Instant =
        Instant.now().plusSeconds(minutesFromNow * 60)

    private fun futureEnd(minutesFromNow: Long): Instant =
        Instant.now().plusSeconds((minutesFromNow + 45) * 60)

    private data class AttendanceRow(
        val status: String,
        val actualStart: Instant?,
        val joinedAt: Instant?,
        val leftAt: Instant?,
        val attendanceStatus: String?,
    )
}
