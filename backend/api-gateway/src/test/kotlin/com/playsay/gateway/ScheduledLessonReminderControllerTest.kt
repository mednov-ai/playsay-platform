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

class ScheduledLessonReminderControllerTest : ScheduledLessonControllerTestFixture() {
    @Test
    fun `lesson creation enqueues reminder for teacher and participants`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val start = futureWeekdayStart(DayOfWeek.MONDAY)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = start,
                scheduledEnd = start.plus(Duration.ofMinutes(45)),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val reminders = lessonEmailReminderRepo.findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lesson.id)

        assertEquals(2, reminders.size)
        assertEquals(listOf("STUDENT", "TEACHER"), reminders.map { reminder -> reminder.recipientRole }.sorted())
        assertEquals(listOf(start.minus(Duration.ofMinutes(30)), start.minus(Duration.ofMinutes(30))), reminders.map { reminder -> reminder.dueAt })
        assertEquals(listOf("PENDING", "PENDING"), reminders.map { reminder -> reminder.status })
    }

    @Test
    fun `lesson reminder scheduler sends due reminders once and skips recipients without email`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        val studentTwoId = userProfileStore.currentUserId(studentTwo)
        appUserRepo.findById(studentTwoId).orElseThrow().apply {
            email = null
            appUserRepo.save(this)
        }
        val start = Instant.now().plus(Duration.ofMinutes(10))
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = start,
                scheduledEnd = start.plus(Duration.ofMinutes(45)),
                type = "GROUP",
                participantSubjects = listOf("student-1", "student-2"),
            ),
        ).body!!

        lessonReminderScheduler.dispatchDueReminders(Instant.now().plus(Duration.ofSeconds(5)))
        lessonReminderScheduler.dispatchDueReminders(Instant.now().plus(Duration.ofSeconds(10)))

        val sent = RecordingLessonReminderEmailClient.sent
        val reminders = lessonEmailReminderRepo.findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lesson.id)

        assertEquals(2, sent.size)
        assertEquals(listOf("student.one@example.com", "teacher.one@example.com"), sent.map { email -> email.to }.sorted())
        assertTrue(sent.all { email -> email.templateKey == "lesson-reminder-30m" })
        assertTrue(sent.all { email -> email.model["lessonUrl"] == "https://online.honey.school/lessons/${lesson.id}/classroom" })
        assertEquals(2, reminders.count { reminder -> reminder.status == "SENT" })
        assertEquals(1, reminders.count { reminder -> reminder.status == "SKIPPED" })
    }

    @Test
    fun `reschedule rebuilds start reminders and supersedes pending student notifications`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val originalStart = futureWeekdayStart(DayOfWeek.MONDAY)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = originalStart,
                scheduledEnd = originalStart.plus(Duration.ofMinutes(45)),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        val firstStart = originalStart.plus(Duration.ofDays(1))
        scheduleController.reschedule(
            teacher,
            lesson.id,
            ScheduledLessonScheduleUpdateRequest(firstStart, firstStart.plus(Duration.ofMinutes(45))),
        )
        val finalStart = firstStart.plus(Duration.ofHours(2))

        val updated = scheduleController.reschedule(
            teacher,
            lesson.id,
            ScheduledLessonScheduleUpdateRequest(finalStart, finalStart.plus(Duration.ofMinutes(45))),
        )
        lessonReminderScheduler.dispatchDueReminders(Instant.now().plus(Duration.ofMinutes(1)))

        val queued = lessonEmailReminderRepo.findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lesson.id)
        val rescheduleNotifications = queued.filter { it.reminderType == "LESSON_RESCHEDULED" }
        val startReminders = queued.filter { it.reminderType == "LESSON_START_30M" }
        val email = RecordingLessonReminderEmailClient.sent.single { it.templateKey == "lesson-rescheduled" }
        assertEquals(finalStart, updated.scheduledStart)
        assertEquals(2, startReminders.size)
        assertTrue(startReminders.all { it.dueAt == finalStart.minus(Duration.ofMinutes(30)) })
        assertEquals(2, rescheduleNotifications.size)
        assertEquals(1, rescheduleNotifications.count { it.status == "CANCELLED" })
        assertEquals(1, rescheduleNotifications.count { it.status == "SENT" })
        assertEquals("student.one@example.com", email.to)
        assertEquals("Teacher one", email.model["teacherName"])
        assertNotNull(email.model["previousStartsAt"])
        assertNotNull(email.model["previousEndsAt"])
        assertNotNull(email.model["startsAt"])
        assertNotNull(email.model["endsAt"])
    }

    @Test
    fun `same schedule repairs a future in-progress lesson without sending reschedule email`() {
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
        lessonRepo.findById(lesson.id).orElseThrow().also { stored ->
            stored.status = "IN_PROGRESS"
            stored.actualStart = Instant.now()
            lessonRepo.saveAndFlush(stored)
        }
        lessonEmailReminderRepo.findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lesson.id)
            .onEach { reminder -> reminder.status = "CANCELLED" }
            .also(lessonEmailReminderRepo::saveAllAndFlush)

        val repaired = scheduleController.reschedule(
            teacher,
            lesson.id,
            ScheduledLessonScheduleUpdateRequest(requireNotNull(lesson.scheduledStart), requireNotNull(lesson.scheduledEnd)),
        )

        val stored = lessonRepo.findById(lesson.id).orElseThrow()
        assertEquals("SCHEDULED", repaired.status)
        assertNull(stored.actualStart)
        assertNull(stored.actualEnd)
        val reminders = lessonEmailReminderRepo.findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lesson.id)
        assertTrue(reminders.none { it.reminderType == "LESSON_RESCHEDULED" })
        assertEquals(2, reminders.count { it.reminderType == "LESSON_START_30M" && it.status == "PENDING" })
    }

    @Test
    fun `reschedule changes only the selected lesson occurrence in a series`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val originalStart = futureWeekdayStart(DayOfWeek.MONDAY)
        val selected = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = originalStart,
                scheduledEnd = originalStart.plus(Duration.ofMinutes(45)),
                recurrence = ScheduledLessonRecurrenceRequest(
                    mode = "WEEKLY_COUNT",
                    count = 2,
                    weekdays = listOf("MONDAY"),
                    timeZone = "UTC",
                ),
            ),
        ).body!!
        val untouched = scheduleController.list(teacher).single { it.id != selected.id }
        val movedStart = originalStart.plus(Duration.ofDays(1))

        scheduleController.reschedule(
            teacher,
            selected.id,
            ScheduledLessonScheduleUpdateRequest(movedStart, movedStart.plus(Duration.ofMinutes(45))),
        )

        val lessons = scheduleController.list(teacher)
        assertEquals(movedStart, lessons.single { it.id == selected.id }.scheduledStart)
        assertEquals(untouched.scheduledStart, lessons.single { it.id == untouched.id }.scheduledStart)
    }

    @Test
    fun `reschedule rejects invalid duration and closed lessons`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val start = futureStart(60)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(scheduledStart = start, scheduledEnd = start.plus(Duration.ofMinutes(45))),
        ).body!!

        assertFailsWith<ResponseStatusException> {
            scheduleController.reschedule(
                teacher,
                lesson.id,
                ScheduledLessonScheduleUpdateRequest(start, start.plus(Duration.ofMinutes(5))),
            )
        }.also { error -> assertEquals(HttpStatus.BAD_REQUEST, error.statusCode) }

        scheduleController.complete(teacher, lesson.id)
        assertFailsWith<ResponseStatusException> {
            scheduleController.reschedule(
                teacher,
                lesson.id,
                ScheduledLessonScheduleUpdateRequest(start.plus(Duration.ofHours(1)), start.plus(Duration.ofHours(2))),
            )
        }.also { error -> assertEquals(HttpStatus.CONFLICT, error.statusCode) }
    }

    @Test
    fun `reschedule skips missing email and records provider failure without rollback`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        val studentTwoId = userProfileStore.currentUserId(studentTwo)
        appUserRepo.findById(studentTwoId).orElseThrow().also { user ->
            user.email = null
            appUserRepo.saveAndFlush(user)
        }
        val originalStart = futureStart(120).truncatedTo(ChronoUnit.MICROS)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = originalStart,
                scheduledEnd = originalStart.plus(Duration.ofMinutes(45)),
                participantSubjects = listOf("student-1", "student-2"),
            ),
        ).body!!
        val movedStart = originalStart.plus(Duration.ofHours(1))
        RecordingLessonReminderEmailClient.failFor = "student.one@example.com"

        scheduleController.reschedule(
            teacher,
            lesson.id,
            ScheduledLessonScheduleUpdateRequest(movedStart, movedStart.plus(Duration.ofMinutes(45))),
        )
        lessonReminderScheduler.dispatchDueReminders(Instant.now().plus(Duration.ofMinutes(1)))

        val notifications = lessonEmailReminderRepo.findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lesson.id)
            .filter { it.reminderType == "LESSON_RESCHEDULED" }
        assertEquals(setOf("FAILED", "SKIPPED"), notifications.map { it.status }.toSet())
        assertEquals(
            movedStart.truncatedTo(ChronoUnit.MICROS),
            lessonRepo.findById(lesson.id).orElseThrow().scheduledStart?.truncatedTo(ChronoUnit.MICROS),
        )
    }

}
