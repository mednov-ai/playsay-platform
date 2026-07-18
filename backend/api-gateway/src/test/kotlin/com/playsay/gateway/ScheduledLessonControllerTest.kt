package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.StudentProfileEntity
import com.playsay.gateway.entity.TeacherDelegationEntity
import com.playsay.gateway.entity.TeacherDelegationStudentEntity
import com.playsay.gateway.repo.*
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
    private val studentInviteController: StudentInviteController,
    private val liveKitRoomController: LiveKitRoomController,
    private val liveKitWebhookController: LiveKitWebhookController,
    private val courseController: CourseController,
    private val materialCrudController: MaterialCrudController,
    private val userProfileStore: UserProfileStore,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonRepo: LessonRepo,
    private val lessonEmailReminderRepo: LessonEmailReminderRepo,
    private val lessonReminderScheduler: LessonReminderScheduler,
    private val lessonTemplateRepo: LessonTemplateRepo,
    private val courseRepo: CourseRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val appUserRepo: AppUserRepo,
    private val studentProfileRepo: StudentProfileRepo,
    private val teacherDelegationRepo: TeacherDelegationRepo,
    private val teacherDelegationStudentRepo: TeacherDelegationStudentRepo,
    private val userManagementAuditRepo: UserManagementAuditRepo,
    private val dataSource: DataSource,
) {
    @TestConfiguration
    class LessonReminderTestConfig {
        @Bean
        @Primary
        fun lessonReminderEmailClient(): LessonReminderEmailClient = RecordingLessonReminderEmailClient

        @Bean
        @Primary
        fun registrationGateway(): RegistrationGateway = RecordingScheduledLessonRegistrationGateway
    }

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@ScheduledLessonControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        RecordingLessonReminderEmailClient.sent.clear()
        RecordingLessonReminderEmailClient.failFor = null
        RecordingScheduledLessonRegistrationGateway.reset()
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
        assertTrue(links.links.single().url.endsWith("/join#A7K2Q9"))
        assertFalse(links.links.single().url.contains("?token="))
        assertEquals(lesson.id, RecordingScheduledLessonRegistrationGateway.invites.single().lessonId)
        assertEquals("managed-student-1", RecordingScheduledLessonRegistrationGateway.invites.single().subject)
        assertEquals("new.student", RecordingScheduledLessonRegistrationGateway.invites.single().username)
        assertEquals(null, RecordingScheduledLessonRegistrationGateway.invites.single().email)
        assertTrue(RecordingScheduledLessonRegistrationGateway.invites.single().continueUrl.endsWith("/lessons/${lesson.id}/classroom"))
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
        assertTrue(sent.all { email -> email.model["lessonUrl"] == "https://online.play-and-say.ru/lessons/${lesson.id}/classroom" })
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

        val repaired = scheduleController.reschedule(
            teacher,
            lesson.id,
            ScheduledLessonScheduleUpdateRequest(requireNotNull(lesson.scheduledStart), requireNotNull(lesson.scheduledEnd)),
        )

        val stored = lessonRepo.findById(lesson.id).orElseThrow()
        assertEquals("SCHEDULED", repaired.status)
        assertNull(stored.actualStart)
        assertNull(stored.actualEnd)
        assertTrue(lessonEmailReminderRepo.findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lesson.id)
            .none { it.reminderType == "LESSON_RESCHEDULED" })
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
        val originalStart = futureStart(120)
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

    @Test
    fun `scheduled lesson uses direct material before template material and inherits template material when direct is absent`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val templateMaterial = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Template material", status = "PUBLISHED"),
        ).body!!
        val directMaterial = materialCrudController.create(
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
        val withoutMaterial = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplate.id,
                materialId = null,
                inheritTemplateMaterial = false,
                scheduledStart = futureStart(180),
                scheduledEnd = futureEnd(180),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        assertEquals(templateMaterial.id, inherited.materialId)
        assertTrue(inherited.inheritTemplateMaterial)
        assertEquals("Template material", inherited.materialTitle)
        assertEquals(directMaterial.id, direct.materialId)
        assertFalse(direct.inheritTemplateMaterial)
        assertEquals("Direct material", direct.materialTitle)
        assertNull(withoutMaterial.materialId)
        assertNull(withoutMaterial.materialTitle)
        assertFalse(withoutMaterial.inheritTemplateMaterial)
        assertNull(lessonRepo.findScheduledMaterialLookup(withoutMaterial.id)?.materialId)
        assertEquals(directMaterial.id, scheduleController.get(student, direct.id).materialId)
    }

    @Test
    fun `scheduling assigns an unowned student to the lesson teacher`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val teacherId = userProfileStore.currentUserId(teacher)
        val student = appUserRepo.findByKeycloakSubject("student-1")!!
        student.managedByTeacher = false
        student.managedByTeacherUserId = null
        appUserRepo.saveAndFlush(student)

        scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                participantSubjects = listOf("student-1"),
            ),
        )

        val attached = appUserRepo.findByKeycloakSubject("student-1")!!
        assertTrue(attached.managedByTeacher)
        assertEquals(teacherId, attached.managedByTeacherUserId)
        assertTrue(teacherDelegationRepo.findAll().isEmpty())
    }

    @Test
    fun `pure admin does not become the student's teacher`() {
        val admin = authentication(subject = "admin-1", username = "admin.one", role = "ROLE_ADMIN")
        userProfileStore.currentUserId(admin)
        val student = appUserRepo.findByKeycloakSubject("student-1")!!
        student.managedByTeacher = false
        student.managedByTeacherUserId = null
        appUserRepo.saveAndFlush(student)

        scheduleController.create(
            admin,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                participantSubjects = listOf("student-1"),
            ),
        )

        assertNull(appUserRepo.findByKeycloakSubject("student-1")!!.managedByTeacherUserId)
        assertTrue(teacherDelegationRepo.findAll().isEmpty())
    }

    @Test
    fun `admin update attaches student to the stored lesson teacher`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val teacherId = userProfileStore.currentUserId(teacher)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
            ),
        ).body!!
        val student = appUserRepo.findByKeycloakSubject("student-1")!!
        student.managedByTeacher = false
        student.managedByTeacherUserId = null
        appUserRepo.saveAndFlush(student)
        val admin = authentication(subject = "admin-1", username = "admin.one", role = "ROLE_ADMIN")
        userProfileStore.currentUserId(admin)

        scheduleController.update(
            admin,
            lesson.id,
            ScheduledLessonRequest(
                scheduledStart = lesson.scheduledStart,
                scheduledEnd = lesson.scheduledEnd,
                participantSubjects = listOf("student-1"),
            ),
        )

        assertEquals(teacherId, appUserRepo.findByKeycloakSubject("student-1")!!.managedByTeacherUserId)
    }

    @Test
    fun `admin teacher schedules foreign student through schedule delegation and deletion revokes it`() {
        val teacher = authentication(
            subject = "teacher-1",
            username = "teacher.one",
            role = "ROLE_TEACHER",
            "ROLE_ADMIN",
        )
        val teacherId = userProfileStore.currentUserId(teacher)
        appUserRepo.seedPrimaryTeacherWithStudents("teacher-2", "foreign-student")
        val primaryTeacherId = appUserRepo.findByKeycloakSubject("teacher-2")!!.id
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                participantSubjects = listOf("foreign-student"),
            ),
        ).body!!

        assertEquals(primaryTeacherId, appUserRepo.findByKeycloakSubject("foreign-student")!!.managedByTeacherUserId)
        val delegation = teacherDelegationRepo.findAll().single()
        assertEquals(primaryTeacherId, delegation.primaryTeacherUserId)
        assertEquals(teacherId, delegation.delegateTeacherUserId)
        assertEquals("SCHEDULE", delegation.sourceKind)
        assertEquals(lesson.id, delegation.sourceId)
        assertEquals(
            appUserRepo.findByKeycloakSubject("foreign-student")!!.id,
            teacherDelegationStudentRepo.findByDelegationId(delegation.id).single().studentUserId,
        )
        assertTrue(userManagementAuditRepo.findAll().any { audit ->
            audit.action == "SCHEDULE_CREATE" && audit.details.contains(lesson.id.toString())
        })

        scheduleController.delete(teacher, lesson.id)

        assertNotNull(teacherDelegationRepo.findById(delegation.id).orElseThrow().revokedAt)
    }

    @Test
    fun `ordinary teacher cannot create a new delegation for a foreign student`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        appUserRepo.seedPrimaryTeacherWithStudents("teacher-2", "foreign-student")

        val error = assertFailsWith<ResponseStatusException> {
            scheduleController.create(
                teacher,
                ScheduledLessonRequest(
                    scheduledStart = futureStart(60),
                    scheduledEnd = futureEnd(60),
                    participantSubjects = listOf("foreign-student"),
                ),
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
        assertTrue(lessonRepo.findAll().isEmpty())
        assertTrue(teacherDelegationRepo.findAll().isEmpty())
    }

    @Test
    fun `ordinary teacher reuses a covering manual delegation`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val teacherId = userProfileStore.currentUserId(teacher)
        appUserRepo.seedPrimaryTeacherWithStudents("teacher-2", "foreign-student")
        val primaryTeacherId = appUserRepo.findByKeycloakSubject("teacher-2")!!.id
        val studentId = appUserRepo.findByKeycloakSubject("foreign-student")!!.id
        val now = Instant.now()
        val manual = teacherDelegationRepo.saveAndFlush(
            TeacherDelegationEntity(
                primaryTeacherUserId = primaryTeacherId,
                delegateTeacherUserId = teacherId,
                startsAt = now.minus(Duration.ofHours(1)),
                endsAt = now.plus(Duration.ofDays(3)),
                createdByUserId = primaryTeacherId,
                createdAt = now,
            ),
        )
        teacherDelegationStudentRepo.saveAndFlush(
            TeacherDelegationStudentEntity(
                delegationId = manual.id,
                studentUserId = studentId,
                createdAt = now,
            ),
        )

        val created = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                participantSubjects = listOf("foreign-student"),
            ),
        ).body!!

        assertEquals(listOf("foreign-student"), created.participants.map { participant -> participant.subject })
        assertEquals(listOf("MANUAL"), teacherDelegationRepo.findAll().map { delegation -> delegation.sourceKind })
    }

    @Test
    fun `series keeps one schedule delegation until its last lesson is deleted`() {
        val teacher = authentication(
            subject = "teacher-1",
            username = "teacher.one",
            role = "ROLE_TEACHER",
            "ROLE_ADMIN",
        )
        userProfileStore.currentUserId(teacher)
        appUserRepo.seedPrimaryTeacherWithStudents("teacher-2", "foreign-student")
        val firstStart = futureWeekdayStart(DayOfWeek.MONDAY)
        val created = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = firstStart,
                scheduledEnd = firstStart.plus(Duration.ofMinutes(45)),
                participantSubjects = listOf("foreign-student"),
                recurrence = ScheduledLessonRecurrenceRequest(
                    mode = "WEEKLY_COUNT",
                    count = 2,
                    weekdays = listOf("MONDAY"),
                    timeZone = "UTC",
                ),
            ),
        ).body!!
        val seriesLessons = scheduleController.list(teacher)
        val delegation = teacherDelegationRepo.findAll().single()

        assertEquals(created.recurrenceSeriesId, delegation.sourceId)
        assertEquals(2, seriesLessons.size)
        scheduleController.delete(teacher, seriesLessons.first().id)
        assertNull(teacherDelegationRepo.findById(delegation.id).orElseThrow().revokedAt)
        scheduleController.delete(teacher, seriesLessons.last().id)
        assertNotNull(teacherDelegationRepo.findById(delegation.id).orElseThrow().revokedAt)
    }

    @Test
    fun `teacher schedules parallel lesson with per participant material assignments`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val materialOne = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Student one material", status = "PUBLISHED"),
        ).body!!
        val materialTwo = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Student two material", status = "PUBLISHED"),
        ).body!!

        val created = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = futureStart(60),
                scheduledEnd = futureEnd(60),
                type = "GROUP",
                workMode = "PARALLEL",
                participantSubjects = listOf("student-1", "student-2"),
                participantAssignments = listOf(
                    ScheduledLessonMaterialAssignmentRequest(
                        materialId = materialOne.id,
                        participantSubjects = listOf("student-1"),
                    ),
                    ScheduledLessonMaterialAssignmentRequest(
                        materialId = materialTwo.id,
                        participantSubjects = listOf("student-2"),
                    ),
                ),
            ),
        ).body!!

        assertEquals("PARALLEL", created.workMode)
        assertNull(created.materialId)
        assertEquals(
            mapOf("student-1" to materialOne.id, "student-2" to materialTwo.id),
            created.participants.associate { participant -> participant.subject to participant.materialId },
        )
        assertEquals(
            mapOf("student-1" to "Student one material", "student-2" to "Student two material"),
            created.participants.associate { participant -> participant.subject to participant.materialTitle },
        )
        assertEquals(materialOne.id, scheduleController.get(studentOne, created.id).materialId)
        assertEquals(materialTwo.id, scheduleController.get(studentTwo, created.id).materialId)
    }

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

    private fun futureWeekdayStart(dayOfWeek: DayOfWeek, time: LocalTime = LocalTime.of(10, 0)): Instant =
        LocalDate.now(ZoneOffset.UTC)
            .plusDays(1)
            .with(TemporalAdjusters.nextOrSame(dayOfWeek))
            .atTime(time)
            .toInstant(ZoneOffset.UTC)

    private data class AttendanceRow(
        val status: String,
        val actualStart: Instant?,
        val joinedAt: Instant?,
        val leftAt: Instant?,
        val attendanceStatus: String?,
    )
}

private object RecordingLessonReminderEmailClient : LessonReminderEmailClient {
    val sent = mutableListOf<LessonReminderEmailCommand>()
    var failFor: String? = null

    override fun send(command: LessonReminderEmailCommand) {
        if (command.to == failFor) {
            error("simulated email provider failure")
        }
        sent += command
    }
}

private object RecordingScheduledLessonRegistrationGateway : RegistrationGateway {
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

    override fun createManagedStudent(request: ManagedStudentRequest): ManagedStudentProvisionResponse =
        ManagedStudentProvisionResponse(
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
