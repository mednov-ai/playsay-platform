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

class ScheduledLessonParticipantControllerTest : ScheduledLessonControllerTestFixture() {
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
    fun `teacher creates participant magic link for managed student`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val teacherUserId = userProfileStore.currentUserId(teacher)
        val now = Instant.parse("2026-05-24T10:00:00Z")
        appUserRepo.saveAndFlush(
            AppUserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = "managed-student-1",
                username = "new.student",
                email = null,
                name = "New Student",
                roles = "STUDENT",
                displayName = "New Student",
                countryCode = "RU",
                managedByTeacher = true,
                managedByTeacherUserId = teacherUserId,
                createdAt = now,
                updatedAt = now,
            ),
        )
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.parse("2026-05-25T10:00:00Z"),
                scheduledEnd = Instant.parse("2026-05-25T10:45:00Z"),
                participantSubjects = listOf("managed-student-1"),
            ),
        ).body!!

        val links = scheduleController.createParticipantLinks(teacher, lesson.id)

        assertEquals(1, links.links.size)
        assertEquals("managed-student-1", links.links.single().subject)
        assertEquals("MAGIC_LINK", links.links.single().mode)
        assertTrue(links.links.single().url.startsWith("https://online.honeyschool.ru/"))
        assertTrue(links.links.single().url.endsWith("/join#A7K2Q9"))
        assertFalse(links.links.single().url.contains("?token="))
        assertEquals(lesson.id, RecordingScheduledLessonRegistrationGateway.invites.single().lessonId)
        assertEquals("managed-student-1", RecordingScheduledLessonRegistrationGateway.invites.single().subject)
        assertEquals("new.student", RecordingScheduledLessonRegistrationGateway.invites.single().username)
        assertEquals(null, RecordingScheduledLessonRegistrationGateway.invites.single().email)
        assertTrue(RecordingScheduledLessonRegistrationGateway.invites.single().continueUrl.startsWith("https://online.honeyschool.ru/"))
        assertTrue(RecordingScheduledLessonRegistrationGateway.invites.single().continueUrl.endsWith("/lessons/${lesson.id}/classroom"))

        RecordingScheduledLessonRegistrationGateway.reset()
        val directLinks = scheduleController.createParticipantLinks(teacher, lesson.id, ScheduledLessonLinkOrigin.HONEY_SCHOOL)
        assertTrue(directLinks.links.single().url.startsWith("https://online.honey.school/"))
        assertTrue(RecordingScheduledLessonRegistrationGateway.invites.single().continueUrl.startsWith("https://online.honey.school/"))
    }

    @Test
    fun `student invite waits before lesson access window without consuming registration invite`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentSubject = "managed-student-1"
        userProfileStore.currentUserId(authentication(subject = studentSubject, username = "managed.one", role = "ROLE_STUDENT"))
        appUserRepo.assignStudentToTeacher(studentSubject)
        val scheduledStart = Instant.now().plus(Duration.ofMinutes(20)).truncatedTo(ChronoUnit.MICROS)
        val scheduledEnd = scheduledStart.plus(Duration.ofMinutes(45))
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = scheduledStart,
                scheduledEnd = scheduledEnd,
                participantSubjects = listOf(studentSubject),
            ),
        ).body!!
        RecordingScheduledLessonRegistrationGateway.lookupResponse = ManagedStudentInviteLookupResponse(
            subject = studentSubject,
            username = "managed.one",
            email = "managed@example.com",
            displayName = "Managed Student",
            lessonId = lesson.id,
            continueUrl = "https://online.play-and-say.ru/lessons/${lesson.id}/classroom",
            expiresAt = scheduledEnd,
        )

        val response = studentInviteController.consume(
            StudentInviteConsumeRequest(token = "A7K2Q9"),
            jakarta.servlet.http.HttpServletRequestWrapper(org.springframework.mock.web.MockHttpServletRequest()),
        )

        assertEquals("WAITING", response.status)
        assertEquals(scheduledStart.minusSeconds(LESSON_ACCESS_GRACE_SECONDS), response.opensAt)
        assertEquals(scheduledStart, response.scheduledStart)
        assertEquals(scheduledEnd, response.scheduledEnd)
        assertTrue((response.retryAfterSeconds ?: 0) > 0)
        assertEquals(listOf("A7K2Q9"), RecordingScheduledLessonRegistrationGateway.lookups.map { it.token })
        assertTrue(RecordingScheduledLessonRegistrationGateway.consumes.isEmpty())
    }

    @Test
    fun `student invite authenticates inside current lesson access window`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentSubject = "managed-student-1"
        userProfileStore.currentUserId(authentication(subject = studentSubject, username = "managed.one", role = "ROLE_STUDENT"))
        appUserRepo.assignStudentToTeacher(studentSubject)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.now().plus(Duration.ofMinutes(5)),
                scheduledEnd = Instant.now().plus(Duration.ofMinutes(50)),
                participantSubjects = listOf(studentSubject),
            ),
        ).body!!
        RecordingScheduledLessonRegistrationGateway.lookupResponse = ManagedStudentInviteLookupResponse(
            subject = studentSubject,
            username = "managed.one",
            email = "managed@example.com",
            displayName = "Managed Student",
            lessonId = lesson.id,
            continueUrl = "https://online.play-and-say.ru/lessons/${lesson.id}/classroom",
            expiresAt = lesson.scheduledEnd!!,
        )

        val response = studentInviteController.consume(
            StudentInviteConsumeRequest(token = "A7K2Q9"),
            jakarta.servlet.http.HttpServletRequestWrapper(org.springframework.mock.web.MockHttpServletRequest()),
        )

        assertEquals("AUTHENTICATED", response.status)
        assertEquals("access-token", response.accessToken)
        assertEquals(listOf("A7K2Q9"), RecordingScheduledLessonRegistrationGateway.lookups.map { it.token })
        assertEquals(listOf("A7K2Q9"), RecordingScheduledLessonRegistrationGateway.consumes.map { it.token })
    }

}
