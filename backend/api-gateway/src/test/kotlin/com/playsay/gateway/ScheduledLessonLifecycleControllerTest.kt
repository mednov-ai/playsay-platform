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

class ScheduledLessonLifecycleControllerTest : ScheduledLessonControllerTestFixture() {
    @Test
    fun `teacher schedules weekly recurrence as separate lessons`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lessonTemplateId = courseLessonId(teacher)
        val firstStart = futureWeekdayStart(DayOfWeek.MONDAY)
        val firstEnd = firstStart.plus(Duration.ofMinutes(45))

        val created = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = firstStart,
                scheduledEnd = firstEnd,
                type = "GROUP",
                participantSubjects = listOf("student-1"),
                recurrence = ScheduledLessonRecurrenceRequest(
                    mode = "WEEKLY_COUNT",
                    count = 4,
                    weekdays = listOf("MONDAY"),
                    timeZone = "UTC",
                ),
            ),
        ).body!!

        val lessons = scheduleController.list(teacher)

        assertEquals(4, lessons.size)
        assertNotNull(created.recurrenceSeriesId)
        assertEquals(listOf(1, 2, 3, 4), lessons.map { lesson -> lesson.recurrenceIndex })
        assertEquals(listOf(4, 4, 4, 4), lessons.map { lesson -> lesson.recurrenceTotal })
        assertEquals(1, lessons.map { lesson -> lesson.recurrenceSeriesId }.distinct().size)
        assertEquals(
            listOf(
                firstStart,
                firstStart.plus(Duration.ofDays(7)),
                firstStart.plus(Duration.ofDays(14)),
                firstStart.plus(Duration.ofDays(21)),
            ),
            lessons.map { lesson -> lesson.scheduledStart },
        )
        assertEquals(8, lessonEmailReminderRepo.count())
        assertTrue(lessons.all { lesson -> lesson.participants.map { participant -> participant.subject } == listOf("student-1") })
    }

    @Test
    fun `teacher schedules weekly recurrence by weeks with per weekday times`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lessonTemplateId = courseLessonId(teacher)

        val created = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = Instant.parse("2026-06-29T10:00:00Z"),
                scheduledEnd = Instant.parse("2026-06-29T10:45:00Z"),
                type = "GROUP",
                participantSubjects = listOf("student-1"),
                recurrence = ScheduledLessonRecurrenceRequest(
                    mode = "WEEKLY_BY_WEEK",
                    count = 4,
                    weekdays = listOf("MONDAY", "WEDNESDAY"),
                    weekdayTimes = mapOf(
                        "MONDAY" to "10:00",
                        "WEDNESDAY" to "16:00",
                    ),
                    timeZone = "UTC",
                ),
            ),
        ).body!!

        val lessons = scheduleController.list(teacher)

        assertEquals(8, lessons.size)
        assertNotNull(created.recurrenceSeriesId)
        assertEquals((1..8).toList(), lessons.map { lesson -> lesson.recurrenceIndex })
        assertEquals(List(8) { 8 }, lessons.map { lesson -> lesson.recurrenceTotal })
        assertEquals(
            listOf(
                Instant.parse("2026-06-29T10:00:00Z"),
                Instant.parse("2026-07-01T16:00:00Z"),
                Instant.parse("2026-07-06T10:00:00Z"),
                Instant.parse("2026-07-08T16:00:00Z"),
                Instant.parse("2026-07-13T10:00:00Z"),
                Instant.parse("2026-07-15T16:00:00Z"),
                Instant.parse("2026-07-20T10:00:00Z"),
                Instant.parse("2026-07-22T16:00:00Z"),
            ),
            lessons.map { lesson -> lesson.scheduledStart },
        )
        assertTrue(
            lessons.all { lesson ->
                Duration.between(lesson.scheduledStart, lesson.scheduledEnd) == Duration.ofMinutes(45)
            },
        )
    }

    @Test
    fun `teacher cannot create recurrence with invalid count or update lesson with recurrence`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")

        val invalidCount = assertFailsWith<ResponseStatusException> {
            scheduleController.create(
                teacher,
                ScheduledLessonRequest(
                    scheduledStart = Instant.parse("2026-06-29T10:00:00Z"),
                    scheduledEnd = Instant.parse("2026-06-29T10:45:00Z"),
                    recurrence = ScheduledLessonRecurrenceRequest(
                        mode = "WEEKLY_COUNT",
                        count = 1,
                        weekdays = listOf("MONDAY"),
                        timeZone = "UTC",
                    ),
                ),
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, invalidCount.statusCode)

        val invalidWeekCount = assertFailsWith<ResponseStatusException> {
            scheduleController.create(
                teacher,
                ScheduledLessonRequest(
                    scheduledStart = Instant.parse("2026-06-29T10:00:00Z"),
                    scheduledEnd = Instant.parse("2026-06-29T10:45:00Z"),
                    recurrence = ScheduledLessonRecurrenceRequest(
                        mode = "WEEKLY_BY_WEEK",
                        count = 0,
                        weekdays = listOf("MONDAY"),
                        weekdayTimes = mapOf("MONDAY" to "10:00"),
                        timeZone = "UTC",
                    ),
                ),
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, invalidWeekCount.statusCode)

        val missingWeekdayTime = assertFailsWith<ResponseStatusException> {
            scheduleController.create(
                teacher,
                ScheduledLessonRequest(
                    scheduledStart = Instant.parse("2026-06-29T10:00:00Z"),
                    scheduledEnd = Instant.parse("2026-06-29T10:45:00Z"),
                    recurrence = ScheduledLessonRecurrenceRequest(
                        mode = "WEEKLY_BY_WEEK",
                        count = 4,
                        weekdays = listOf("MONDAY", "WEDNESDAY"),
                        weekdayTimes = mapOf("MONDAY" to "10:00"),
                        timeZone = "UTC",
                    ),
                ),
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, missingWeekdayTime.statusCode)

        val invalidWeekdayTime = assertFailsWith<ResponseStatusException> {
            scheduleController.create(
                teacher,
                ScheduledLessonRequest(
                    scheduledStart = Instant.parse("2026-06-29T10:00:00Z"),
                    scheduledEnd = Instant.parse("2026-06-29T10:45:00Z"),
                    recurrence = ScheduledLessonRecurrenceRequest(
                        mode = "WEEKLY_BY_WEEK",
                        count = 4,
                        weekdays = listOf("MONDAY"),
                        weekdayTimes = mapOf("MONDAY" to "25:00"),
                        timeZone = "UTC",
                    ),
                ),
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, invalidWeekdayTime.statusCode)

        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = Instant.parse("2026-06-29T10:00:00Z"),
                scheduledEnd = Instant.parse("2026-06-29T10:45:00Z"),
            ),
        ).body!!

        val updateWithRecurrence = assertFailsWith<ResponseStatusException> {
            scheduleController.update(
                teacher,
                lesson.id,
                ScheduledLessonRequest(
                    scheduledStart = Instant.parse("2026-06-29T12:00:00Z"),
                    scheduledEnd = Instant.parse("2026-06-29T12:45:00Z"),
                    recurrence = ScheduledLessonRecurrenceRequest(
                        mode = "WEEKLY_COUNT",
                        count = 2,
                        weekdays = listOf("MONDAY"),
                        timeZone = "UTC",
                    ),
                ),
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, updateWithRecurrence.statusCode)
    }

}
