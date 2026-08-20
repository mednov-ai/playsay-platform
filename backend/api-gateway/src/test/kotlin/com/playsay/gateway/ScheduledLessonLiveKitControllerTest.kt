package com.playsay.gateway

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
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.server.ResponseStatusException
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class ScheduledLessonLiveKitControllerTest : ScheduledLessonControllerTestFixture() {
    @Test
    fun `teacher and participant receive LiveKit room token inside access window`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val now = Instant.now()
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = now.plusSeconds(5 * 60),
                scheduledEnd = now.plusSeconds(50 * 60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val started = scheduleController.start(teacher, lesson.id)

        val teacherToken = liveKitRoomController.createToken(teacher, lesson.id)
        val studentToken = liveKitRoomController.createToken(student, lesson.id)
        val claims = SignedJWT.parse(teacherToken.token).jwtClaimsSet
        val studentClaims = SignedJWT.parse(studentToken.token).jwtClaimsSet
        val videoGrant = claims.getJSONObjectClaim("video")

        assertEquals("wss://online.play-and-say.ru/livekit", teacherToken.serverUrl)
        assertEquals("lesson-${lesson.id}", teacherToken.roomName)
        assertEquals("teacher-1", teacherToken.identity)
        assertFalse(teacherToken.lessonTranslationAllowed)
        assertFalse(studentToken.lessonTranslationAllowed)
        assertEquals("lesson-${lesson.id}", studentToken.roomName)
        assertEquals("IN_PROGRESS", started.status)
        assertEquals("test-key", claims.issuer)
        assertEquals("teacher-1", claims.subject)
        assertEquals("lesson-${lesson.id}", videoGrant["room"])
        assertEquals(true, videoGrant["roomJoin"])
        assertEquals(true, videoGrant["canPublish"])
        assertEquals(true, videoGrant["canSubscribe"])
        assertEquals("""{"playsayRole":"TEACHER"}""", claims.getStringClaim("metadata"))
        assertEquals("""{"playsayRole":"STUDENT"}""", studentClaims.getStringClaim("metadata"))
    }

    @Test
    fun `individual room token exposes explicit student translation permission to both participants`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentId = userProfileStore.currentUserId(student)
        val now = Instant.now()
        studentProfileRepo.saveAndFlush(
            StudentProfileEntity(
                userId = studentId,
                lessonTranslationAllowed = true,
                createdAt = now,
                updatedAt = now,
            ),
        )
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = now.plusSeconds(5 * 60),
                scheduledEnd = now.plusSeconds(50 * 60),
                participantSubjects = listOf("student-1"),
                type = "INDIVIDUAL",
            ),
        ).body!!
        scheduleController.start(teacher, lesson.id)

        val teacherToken = liveKitRoomController.createToken(teacher, lesson.id)
        val studentToken = liveKitRoomController.createToken(student, lesson.id)

        assertTrue(teacherToken.lessonTranslationAllowed)
        assertTrue(studentToken.lessonTranslationAllowed)
    }

    @Test
    fun `LiveKit room token opens ten minutes before start and closes ten minutes after end`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val now = Instant.now()
        val tooEarly = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = now.plusSeconds(11 * 60),
                scheduledEnd = now.plusSeconds(56 * 60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        val justOpen = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = now.plusSeconds(9 * 60),
                scheduledEnd = now.plusSeconds(54 * 60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        val stillOpenAfterEnd = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = now.minusSeconds(54 * 60),
                scheduledEnd = now.minusSeconds(9 * 60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        val tooLate = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = now.minusSeconds(56 * 60),
                scheduledEnd = now.minusSeconds(11 * 60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        assertFailsWith<ResponseStatusException> { scheduleController.start(teacher, tooEarly.id) }
            .also { error -> assertEquals(HttpStatus.CONFLICT, error.statusCode) }
        scheduleController.start(teacher, justOpen.id)
        scheduleController.start(teacher, stillOpenAfterEnd.id)
        assertFailsWith<ResponseStatusException> { scheduleController.start(teacher, tooLate.id) }
            .also { error -> assertEquals(HttpStatus.CONFLICT, error.statusCode) }

        assertFailsWith<ResponseStatusException> {
            liveKitRoomController.createToken(teacher, tooEarly.id)
        }.also { error -> assertEquals(HttpStatus.CONFLICT, error.statusCode) }
        assertFailsWith<ResponseStatusException> {
            liveKitRoomController.createToken(student, tooEarly.id)
        }.also { error -> assertEquals(HttpStatus.NOT_FOUND, error.statusCode) }
        assertEquals("lesson-${justOpen.id}", liveKitRoomController.createToken(student, justOpen.id).roomName)
        assertEquals("lesson-${stillOpenAfterEnd.id}", liveKitRoomController.createToken(student, stillOpenAfterEnd.id).roomName)
        assertFailsWith<ResponseStatusException> {
            liveKitRoomController.createToken(student, tooLate.id)
        }.also { error -> assertEquals(HttpStatus.NOT_FOUND, error.statusCode) }
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
                scheduledStart = Instant.now().plusSeconds(5 * 60),
                scheduledEnd = Instant.now().plusSeconds(50 * 60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        scheduleController.start(teacher, lesson.id)

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

        assertEquals(HttpStatus.CONFLICT, teacherError.statusCode)
        assertEquals(HttpStatus.NOT_FOUND, studentError.statusCode)
    }

    @Test
    fun `teacher starts lesson idempotently and cannot restart a closed lesson`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.now().plusSeconds(5 * 60),
                scheduledEnd = Instant.now().plusSeconds(50 * 60),
            ),
        ).body!!

        val firstStart = scheduleController.start(teacher, lesson.id)
        val secondStart = scheduleController.start(teacher, lesson.id)

        assertEquals("IN_PROGRESS", firstStart.status)
        assertEquals(firstStart.updatedAt, secondStart.updatedAt)

        scheduleController.complete(teacher, lesson.id)
        val error = assertFailsWith<ResponseStatusException> {
            scheduleController.start(teacher, lesson.id)
        }
        assertEquals(HttpStatus.CONFLICT, error.statusCode)
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

        assertEquals(HttpStatus.NO_CONTENT, liveKitWebhookController.receive(joinedBody.toByteArray(), webhookAuthorization(joinedBody)).statusCode)
        assertEquals(HttpStatus.NO_CONTENT, liveKitWebhookController.receive(leftBody.toByteArray(), webhookAuthorization(leftBody)).statusCode)

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
            liveKitWebhookController.receive(body.toByteArray(), "Bearer invalid")
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    @Test
    fun `LiveKit webhook accepts JSON object bodies through MVC byte conversion`() {
        val body = webhookBody("participant_joined", "unknown-room", "student-1", Instant.parse("2026-05-25T10:05:00Z"))
        val mockMvc = MockMvcBuilders.standaloneSetup(liveKitWebhookController).build()

        listOf(MediaType.APPLICATION_JSON, MediaType.parseMediaType("application/webhook+json")).forEach { contentType ->
            mockMvc.perform(
                post("/livekit/webhook")
                    .contentType(contentType)
                    .header("Authorization", webhookAuthorization(body))
                    .content(body.toByteArray()),
            ).andExpect(status().isNoContent)
        }
    }

}
