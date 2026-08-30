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
import com.playsay.gateway.error.ProjectResponseException
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
import kotlin.test.assertNotEquals
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

class ScheduledLessonAccessControllerTest : ScheduledLessonControllerTestFixture() {
    @Test
    fun `rotate and revoke invalidate compact aliases for new attempts`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
            ),
        ).body!!
        val original = lessonAccessController.getOrCreate(teacher, lesson.id)
        val rotated = lessonAccessController.rotate(teacher, lesson.id)

        assertNotEquals(original.alias, rotated.alias)
        assertEquals(original.revision + 1, rotated.revision)
        assertFailsWith<ProjectResponseException> {
            lessonAccessController.startCompact(
                "https://online.honeyschool.ru",
                LessonCompactAccessStartRequest(original.alias),
            )
        }
        lessonAccessController.startCompact(
            "https://online.honeyschool.ru",
            LessonCompactAccessStartRequest(rotated.alias),
        )

        lessonAccessController.revoke(teacher, lesson.id)
        assertFailsWith<ProjectResponseException> {
            lessonAccessController.startCompact(
                "https://online.honeyschool.ru",
                LessonCompactAccessStartRequest(rotated.alias),
            )
        }
    }

    @Test
    fun `legacy lesson token remains valid on both production origins and foreign origin fails`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
            ),
        ).body!!
        lessonAccessController.getOrCreate(teacher, lesson.id)
        val active = lessonAccessLinkRepo.findAll().single()
        val token = lessonAccessTokenService.derive(lesson.id, active.revision, active.keyVersion)

        lessonAccessController.start(lesson.id, "https://online.honeyschool.ru", LessonAccessStartRequest(token))
        lessonAccessController.start(lesson.id, "https://online.honey.school", LessonAccessStartRequest(token))

        assertEquals(
            setOf("https://online.honeyschool.ru", "https://online.honey.school"),
            lessonEntryAttemptRepo.findAll().mapNotNull { it.requestOrigin }.toSet(),
        )
        assertFailsWith<ProjectResponseException> {
            lessonAccessController.start(
                lesson.id,
                "https://online.honeyschool.ru.example",
                LessonAccessStartRequest(token),
            )
        }
    }

    @Test
    fun `teacher receives one compact alias for both origins and each start is origin bound`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
            ),
        ).body!!

        val link = lessonAccessController.getOrCreate(teacher, lesson.id)
        val ru = lessonAccessController.startCompact(
            "https://online.honeyschool.ru",
            LessonCompactAccessStartRequest(link.alias),
        )
        val school = lessonAccessController.startCompact(
            "https://online.honey.school",
            LessonCompactAccessStartRequest(link.alias),
        )

        assertEquals("RU", link.defaultOrigin)
        assertEquals("https://online.honeyschool.ru/l#${link.alias}", link.url)
        assertEquals("https://online.honeyschool.ru/l#${link.alias}", link.urls.ru)
        assertEquals("https://online.honey.school/l#${link.alias}", link.urls.school)
        assertEquals(16, link.alias.length)
        assertNotEquals(ru.attemptId, school.attemptId)
        assertEquals(
            setOf("https://online.honeyschool.ru", "https://online.honey.school"),
            lessonEntryAttemptRepo.findAll().mapNotNull { it.requestOrigin }.toSet(),
        )
        val persisted = lessonAccessLinkRepo.findAll().single()
        assertNotNull(persisted.aliasHash)
        assertNotEquals(link.alias, persisted.aliasHash)
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
        val cancelledLesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = futureStart(90),
                scheduledEnd = futureEnd(90),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        scheduleController.update(
            teacher,
            cancelledLesson.id,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = cancelledLesson.scheduledStart,
                scheduledEnd = cancelledLesson.scheduledEnd,
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
                status = "SCHEDULED",
                type = "INDIVIDUAL",
            ),
        )

        assertEquals("SCHEDULED", updated.status)
        assertEquals("INDIVIDUAL", updated.type)

        assertEquals(HttpStatus.NO_CONTENT, scheduleController.delete(teacher, lesson.id).statusCode)
        assertEquals(emptyList(), scheduleController.list(teacher))
    }

    @Test
    fun `teacher deletes scheduled lesson after creating shared access link`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.parse("2026-05-25T10:00:00Z"),
                scheduledEnd = Instant.parse("2026-05-25T10:45:00Z"),
            ),
        ).body!!
        lessonAccessController.getOrCreate(teacher, lesson.id)

        assertEquals(HttpStatus.NO_CONTENT, scheduleController.delete(teacher, lesson.id).statusCode)
        assertFalse(lessonRepo.existsById(lesson.id))
        assertEquals(emptyList(), lessonAccessLinkRepo.findAll())
    }

    @Test
    fun `create and general update cannot perform lifecycle transitions`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val now = Instant.now()

        assertFailsWith<ResponseStatusException> {
            scheduleController.create(
                teacher,
                ScheduledLessonRequest(
                    scheduledStart = now.plusSeconds(5 * 60),
                    scheduledEnd = now.plusSeconds(50 * 60),
                    status = "IN_PROGRESS",
                ),
            )
        }.also { error -> assertEquals(HttpStatus.CONFLICT, error.statusCode) }

        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = now.plusSeconds(5 * 60),
                scheduledEnd = now.plusSeconds(50 * 60),
            ),
        ).body!!
        assertFailsWith<ResponseStatusException> {
            scheduleController.update(
                teacher,
                lesson.id,
                ScheduledLessonRequest(
                    scheduledStart = lesson.scheduledStart,
                    scheduledEnd = lesson.scheduledEnd,
                    status = "COMPLETED",
                ),
            )
        }.also { error -> assertEquals(HttpStatus.CONFLICT, error.statusCode) }
    }

    @Test
    fun `teacher cannot start a lesson outside the access window`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.now().plus(Duration.ofHours(1)),
                scheduledEnd = Instant.now().plus(Duration.ofHours(2)),
            ),
        ).body!!

        val error = assertFailsWith<ResponseStatusException> { scheduleController.start(teacher, lesson.id) }

        assertEquals(HttpStatus.CONFLICT, error.statusCode)
        assertEquals("SCHEDULED", lessonRepo.findById(lesson.id).orElseThrow().status)
        assertNull(lessonRepo.findById(lesson.id).orElseThrow().actualStart)
    }

    @Test
    fun `teacher completes scheduled lesson and records actual end`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.now().minusSeconds(10 * 60),
                scheduledEnd = Instant.now().plusSeconds(35 * 60),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val completed = scheduleController.complete(teacher, lesson.id)

        assertEquals("COMPLETED", completed.status)
        assertNotNull(lessonRepo.findById(lesson.id).orElseThrow().actualEnd)
        assertFailsWith<ResponseStatusException> {
            liveKitRoomController.createToken(student, lesson.id)
        }.also { error -> assertEquals(HttpStatus.NOT_FOUND, error.statusCode) }
    }

}
