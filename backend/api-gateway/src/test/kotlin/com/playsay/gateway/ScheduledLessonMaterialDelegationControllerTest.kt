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

class ScheduledLessonMaterialDelegationControllerTest : ScheduledLessonControllerTestFixture() {
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

}
