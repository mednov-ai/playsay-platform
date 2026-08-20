package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.repo.*
import com.playsay.gateway.repo.schedule.*
import com.playsay.gateway.service.*
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

class ScheduledMaterialControllerTest : MaterialControllerTestFixture() {
    @Test
    fun `parallel scheduled lesson uses each participant assignment for materials and teacher submissions`() {
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
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
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

        assertEquals(materialOne.id, scheduledMaterialController.scheduledLessonMaterial(studentOne, lesson.id).id)
        assertEquals(materialTwo.id, scheduledMaterialController.scheduledLessonMaterial(studentTwo, lesson.id).id)

        val firstSubmission = scheduledMaterialController.saveScheduledLessonMaterialSubmission(
            studentOne,
            lesson.id,
            MaterialSubmissionRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "materialId": "${materialOne.id}",
                      "answers": {}
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )
        val secondSubmission = scheduledMaterialController.saveScheduledLessonMaterialSubmission(
            studentTwo,
            lesson.id,
            MaterialSubmissionRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "materialId": "${materialTwo.id}",
                      "answers": {}
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(materialOne.id, firstSubmission.materialId)
        assertEquals(materialTwo.id, secondSubmission.materialId)
        assertEquals(
            setOf("student-1" to materialOne.id, "student-2" to materialTwo.id),
            scheduledMaterialController.scheduledLessonMaterialSubmissions(teacher, lesson.id)
                .map { submission -> submission.userSubject to submission.materialId }
                .toSet(),
        )
    }

    @Test
    fun `teacher can save scheduled material submission for selected lesson participant`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Shared teacher-led material", status = "PUBLISHED"),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                type = "GROUP",
                workMode = "SHARED",
                participantSubjects = listOf("student-1", "student-2"),
            ),
        ).body!!

        val teacherLedSubmission = scheduledMaterialController.saveScheduledLessonMaterialSubmission(
            teacher,
            lesson.id,
            MaterialSubmissionRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "materialId": "${material.id}",
                      "answers": {
                        "teacherLed": {
                          "type": "choice",
                          "items": {
                            "question-1": "A"
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
                targetStudentSubject = "student-2",
            ),
        )

        assertEquals("student-2", teacherLedSubmission.userSubject)
        assertEquals("Student two", teacherLedSubmission.userName)
        assertEquals(
            teacherLedSubmission.id,
            scheduledMaterialController.scheduledLessonMaterialSubmission(studentTwo, lesson.id).id,
        )
        assertEquals(
            setOf("student-2"),
            scheduledMaterialController.scheduledLessonMaterialSubmissions(teacher, lesson.id)
                .mapNotNull { submission -> submission.userSubject }
                .toSet(),
        )

        val nonParticipantError = assertFailsWith<ResponseStatusException> {
            scheduledMaterialController.saveScheduledLessonMaterialSubmission(
                teacher,
                lesson.id,
                MaterialSubmissionRequest(
                    content = objectMapper.createObjectNode(),
                    submitted = true,
                    targetStudentSubject = "student-404",
                ),
            )
        }
        assertEquals(HttpStatus.NOT_FOUND, nonParticipantError.statusCode)
    }

    @Test
    fun `first classroom material state returns empty submission and annotation`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "First classroom state", status = "PUBLISHED"),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val submission = scheduledMaterialController.scheduledLessonMaterialSubmission(student, lesson.id)
        val annotation = scheduledMaterialController.scheduledLessonMaterialAnnotation(student, lesson.id)

        assertEquals(material.id, submission.materialId)
        assertEquals(lesson.id, submission.lessonId)
        assertEquals("student-1", submission.userSubject)
        assertEquals(1, submission.content["schemaVersion"].asInt())
        assertEquals(material.id.toString(), submission.content["materialId"].asText())
        assertTrue(submission.content["answers"].isObject)
        assertEquals(0, submission.content["answers"].size())
        assertEquals(null, submission.score)
        assertEquals(null, submission.errorsCount)
        assertEquals(null, submission.submittedAt)
        assertEquals(material.id, annotation.materialId)
        assertEquals(lesson.id, annotation.lessonId)
        assertEquals(1, annotation.content["schemaVersion"].asInt())
        assertEquals(0, annotation.content["strokes"].size())
    }

    @Test
    fun `first classroom annotation lookup uses writable transaction`() {
        val method = LessonMaterialStore::class.java.getDeclaredMethod(
            "getAnnotationForScheduledLesson",
            JwtAuthenticationToken::class.java,
            UUID::class.java,
        )

        assertFalse(method.getAnnotation(Transactional::class.java).readOnly)
    }

    @Test
    fun `scheduled lesson annotation save is idempotent under concurrent create requests`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Concurrent annotation", status = "PUBLISHED"),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val futures = listOf("stroke-a", "stroke-b").map { strokeId ->
                executor.submit(
                    Callable {
                        start.await(5, TimeUnit.SECONDS)
                        scheduledMaterialController.saveScheduledLessonMaterialAnnotation(
                            student,
                            lesson.id,
                            MaterialAnnotationRequest(
                                content = objectMapper.readTree(
                                    """
                                    {
                                      "schemaVersion": 2,
                                      "coordinateSpace": "material-page",
                                      "strokes": [{
                                        "id": "$strokeId",
                                        "pageId": "material",
                                        "color": "#ff5c00",
                                        "points": [{"pageId": "material", "x": 10, "y": 20}]
                                      }]
                                    }
                                    """.trimIndent(),
                                ),
                            ),
                        )
                    },
                )
            }
            start.countDown()
            val annotations = futures.map { future -> future.get(10, TimeUnit.SECONDS) }
            val persisted = requireNotNull(lessonMaterialAnnotationRepo.findByLessonIdAndMaterialId(lesson.id, material.id))

            assertEquals(1, annotations.map { annotation -> annotation.id }.toSet().size)
            assertEquals(1, lessonMaterialAnnotationRepo.findAll().size)
            assertEquals(persisted.id, annotations.first().id)
            assertTrue(
                setOf("stroke-a", "stroke-b").contains(
                    objectMapper.readTree(persisted.content)["strokes"][0]["id"].asText(),
                ),
            )
        } finally {
            executor.shutdownNow()
        }
    }
}
