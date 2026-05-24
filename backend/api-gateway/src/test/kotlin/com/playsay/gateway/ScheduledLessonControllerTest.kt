package com.playsay.gateway

import java.time.Instant
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
import org.springframework.jdbc.core.simple.JdbcClient
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
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ScheduledLessonControllerTest @Autowired constructor(
    private val scheduleController: ScheduledLessonController,
    private val courseController: CourseController,
    private val userProfileStore: UserProfileStore,
    private val jdbcClient: JdbcClient,
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
        jdbcClient.sql("DELETE FROM lesson_participant").update()
        jdbcClient.sql("DELETE FROM lesson").update()
        jdbcClient.sql("DELETE FROM lesson_template").update()
        jdbcClient.sql("DELETE FROM course").update()
        jdbcClient.sql("DELETE FROM app_user").update()
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
                scheduledStart = Instant.parse("2026-05-25T10:00:00Z"),
                scheduledEnd = Instant.parse("2026-05-25T10:45:00Z"),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplateId,
                scheduledStart = Instant.parse("2026-05-25T11:00:00Z"),
                scheduledEnd = Instant.parse("2026-05-25T11:45:00Z"),
                participantSubjects = listOf("student-2"),
            ),
        )

        assertEquals(listOf(ownLesson.id), scheduleController.list(student).map { lesson -> lesson.id })
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
}
