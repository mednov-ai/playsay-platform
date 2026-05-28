package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.repo.*
import com.playsay.gateway.service.*
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
        "spring.datasource.url=jdbc:h2:mem:course-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CourseControllerTest @Autowired constructor(
    private val controller: CourseController,
    private val materialController: MaterialController,
    private val lessonTemplateRepo: LessonTemplateRepo,
    private val courseRepo: CourseRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val appUserRepo: AppUserRepo,
    private val dataSource: DataSource,
) {
    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@CourseControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        lessonTemplateRepo.deleteAllInBatch()
        courseRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
    }

    @Test
    fun `teacher creates course and course lessons`() {
        val teacher = authentication(role = "ROLE_TEACHER")

        val course = controller.create(
            teacher,
            CourseRequest(
                title = "  English A1  ",
                description = "First speaking course",
                level = "A1",
                isPublished = true,
            ),
        ).body

        assertNotNull(course)
        assertEquals(HttpStatus.CREATED, controller.create(teacher, CourseRequest(title = "Draft")).statusCode)
        assertEquals("English A1", course.title)
        assertEquals("en", course.language)
        assertEquals(true, course.isPublished)
        assertNotNull(course.createdByUserId)

        val lesson = controller.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "  Hello classroom  ", orderIndex = 1, plannedDurationMin = 45),
        ).body

        assertNotNull(lesson)
        assertEquals("Hello classroom", lesson.title)
        assertEquals(1, lesson.orderIndex)
        assertEquals(45, lesson.plannedDurationMin)

        assertEquals(1, controller.listLessons(teacher, course.id).size)
        assertEquals(1, controller.get(teacher, course.id).lessonCount)
    }

    @Test
    fun `students see only published courses`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val published = controller.create(teacher, CourseRequest(title = "Published", isPublished = true)).body!!
        val draft = controller.create(teacher, CourseRequest(title = "Draft", isPublished = false)).body!!

        assertEquals(listOf(published.id), controller.list(student).map { course -> course.id })

        val error = assertFailsWith<ResponseStatusException> {
            controller.get(student, draft.id)
        }
        assertEquals(HttpStatus.NOT_FOUND, error.statusCode)
    }

    @Test
    fun `student cannot manage courses`() {
        val error = assertFailsWith<ResponseStatusException> {
            controller.create(authentication(role = "ROLE_STUDENT"), CourseRequest(title = "Nope"))
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `teacher updates and deletes course lesson`() {
        val teacher = authentication(role = "ROLE_TEACHER")
        val course = controller.create(teacher, CourseRequest(title = "Course")).body!!
        val lesson = controller.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "Lesson", orderIndex = 1),
        ).body!!

        val updated = controller.updateLesson(
            teacher,
            course.id,
            lesson.id,
            CourseLessonRequest(title = "Lesson updated", orderIndex = 2, plannedDurationMin = 60),
        )

        assertEquals("Lesson updated", updated.title)
        assertEquals(2, updated.orderIndex)
        assertEquals(60, updated.plannedDurationMin)

        assertEquals(HttpStatus.NO_CONTENT, controller.deleteLesson(teacher, course.id, lesson.id).statusCode)
        assertEquals(emptyList(), controller.listLessons(teacher, course.id))
    }

    @Test
    fun `course lesson list keeps order and material title projection`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val material = materialController.create(
            teacher,
            LessonMaterialRequest(title = "Alphabet cards", status = "PUBLISHED"),
        ).body!!
        val course = controller.create(teacher, CourseRequest(title = "Course", isPublished = true)).body!!
        val second = controller.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "Second lesson", orderIndex = 2, materialId = material.id),
        ).body!!
        val first = controller.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "First lesson", orderIndex = 1),
        ).body!!

        val lessons = controller.listLessons(teacher, course.id)

        assertEquals(listOf(first.id, second.id), lessons.map { lesson -> lesson.id })
        assertEquals("Alphabet cards", lessons.single { lesson -> lesson.id == second.id }.materialTitle)
        assertEquals(2, controller.get(teacher, course.id).lessonCount)
    }

    @Test
    fun `course list returns all courses for teacher and only published for student`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val published = controller.create(teacher, CourseRequest(title = "Published", isPublished = true)).body!!
        val draft = controller.create(teacher, CourseRequest(title = "Draft", isPublished = false)).body!!

        assertEquals(setOf(published.id, draft.id), controller.list(teacher).map { course -> course.id }.toSet())
        assertEquals(listOf(published.id), controller.list(student).map { course -> course.id })
    }

    @Test
    fun `rejects invalid course and lesson payloads`() {
        val teacher = authentication(role = "ROLE_TEACHER")
        val course = controller.create(teacher, CourseRequest(title = "Course")).body!!

        val emptyTitle = assertFailsWith<ResponseStatusException> {
            controller.create(teacher, CourseRequest(title = " "))
        }
        assertEquals(HttpStatus.BAD_REQUEST, emptyTitle.statusCode)

        val tooLongDuration = assertFailsWith<ResponseStatusException> {
            controller.createLesson(teacher, course.id, CourseLessonRequest(title = "Lesson", plannedDurationMin = 481))
        }
        assertEquals(HttpStatus.BAD_REQUEST, tooLongDuration.statusCode)
    }

    @Test
    fun `delete course removes its lessons`() {
        val teacher = authentication(role = "ROLE_TEACHER")
        val course = controller.create(teacher, CourseRequest(title = "Course")).body!!
        controller.createLesson(teacher, course.id, CourseLessonRequest(title = "Lesson"))

        controller.delete(teacher, course.id)

        val error = assertFailsWith<ResponseStatusException> {
            controller.get(teacher, course.id)
        }
        assertEquals(HttpStatus.NOT_FOUND, error.statusCode)

        assertEquals(0L, lessonTemplateRepo.count())
    }

    private fun authentication(
        subject: String = UUID.randomUUID().toString(),
        username: String = "teacher.one",
        role: String,
    ): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token-$subject")
            .header("alg", "none")
            .subject(subject)
            .claim("preferred_username", username)
            .claim("email", "$username@example.com")
            .claim("name", "Teacher One")
            .build()

        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(role)))
    }
}
