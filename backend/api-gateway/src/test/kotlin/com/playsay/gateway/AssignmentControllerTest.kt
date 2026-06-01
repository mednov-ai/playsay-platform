package com.playsay.gateway

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.controller.AssignmentController
import com.playsay.gateway.controller.MaterialCrudController
import com.playsay.gateway.controller.ScheduledLessonController
import com.playsay.gateway.dto.HomeworkAssignmentRequest
import com.playsay.gateway.dto.LessonHomeworkRequest
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.ScheduledLessonRequest
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.CourseRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.repo.LessonTemplateRepo
import com.playsay.gateway.repo.SubmissionRepo
import com.playsay.gateway.service.UserProfileStore
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
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
        "spring.datasource.url=jdbc:h2:mem:assignment-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.storage.provider=memory",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AssignmentControllerTest @Autowired constructor(
    private val assignmentController: AssignmentController,
    private val materialCrudController: MaterialCrudController,
    private val scheduleController: ScheduledLessonController,
    private val userProfileStore: UserProfileStore,
    private val submissionRepo: SubmissionRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val assignmentRepo: AssignmentRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonRepo: LessonRepo,
    private val lessonTemplateRepo: LessonTemplateRepo,
    private val courseRepo: CourseRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val appUserRepo: AppUserRepo,
    private val dataSource: DataSource,
) {
    private val objectMapper = jacksonObjectMapper()

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@AssignmentControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        submissionRepo.deleteAllInBatch()
        assignmentRecipientRepo.deleteAllInBatch()
        assignmentRepo.deleteAllInBatch()
        lessonParticipantRepo.deleteAllInBatch()
        lessonRepo.deleteAllInBatch()
        lessonTemplateRepo.deleteAllInBatch()
        courseRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
    }

    @Test
    fun `teacher creates homework and student gets private material without initial score`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val material = fillGapMaterial(teacher)

        val created = assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(
                materialId = material.id,
                studentSubjects = listOf("student-1", "student-2"),
                dueAt = Instant.now().plusSeconds(86_400),
            ),
        ).body!!

        assertEquals(HttpStatus.CREATED, assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(materialId = material.id, studentSubjects = listOf("student-1")),
        ).statusCode)
        assertEquals(2, created.assignment.recipientCount)
        assertEquals(0, created.assignment.submittedCount)
        assertEquals(0, created.assignment.scoredCount)
        assertNull(created.assignment.averageScore)
        assertTrue(created.recipients.all { recipient -> !recipient.hasSubmission })
        assertTrue(created.recipients.all { recipient -> recipient.score == null })
        assertTrue(created.recipients.all { recipient -> !recipient.showGroupIndicator })

        val studentDetail = assignmentController.getMyHomeworkAssignment(studentOne, created.assignment.id)
        assertEquals(material.id, studentDetail.material.id)
        assertNull(studentDetail.submission.score)
        assertNull(studentDetail.submission.errorsCount)
        assertNull(studentDetail.submission.progressTone)

        val teacherView = assignmentController.getHomeworkAssignment(teacher, created.assignment.id)
        val opened = teacherView.recipients.single { recipient -> recipient.studentSubject == "student-1" }
        assertTrue(opened.hasSubmission)
        assertNull(opened.score)
        assertNull(opened.progressTone)
        assertEquals(0, teacherView.assignment.scoredCount)
    }

    @Test
    fun `group progress uses current score and errors from submissions`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val material = fillGapMaterial(teacher)
        val assignmentId = assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(materialId = material.id, studentSubjects = listOf("student-1", "student-2")),
        ).body!!.assignment.id

        assignmentController.saveMyHomeworkAssignmentSubmission(
            studentOne,
            assignmentId,
            MaterialSubmissionRequest(content = fillGapAnswer(material.id, "dog", correct = false), submitted = false),
        )
        assignmentController.saveMyHomeworkAssignmentSubmission(
            studentTwo,
            assignmentId,
            MaterialSubmissionRequest(content = fillGapAnswer(material.id, "cat", correct = true), submitted = false),
        )

        val progress = assignmentController.getHomeworkAssignment(teacher, assignmentId)
        val weak = progress.recipients.single { recipient -> recipient.studentSubject == "student-1" }
        val strong = progress.recipients.single { recipient -> recipient.studentSubject == "student-2" }

        assertTrue(weak.showGroupIndicator)
        assertTrue(strong.showGroupIndicator)
        assertNotNull(weak.progressTone)
        assertNotNull(strong.progressTone)
        assertTrue(strong.progressTone > weak.progressTone)
        assertTrue(strong.score!! > weak.score)
        assertTrue((weak.errorsCount ?: 0) > (strong.errorsCount ?: 0))
        assertTrue(weak.score!! < BigDecimal.TEN)
        assertEquals(2, progress.assignment.scoredCount)
        assertNotNull(progress.assignment.averageScore)
    }

    @Test
    fun `single recipient homework keeps group progress indicator hidden`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = fillGapMaterial(teacher)
        val assignmentId = assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(materialId = material.id, studentSubjects = listOf("student-1")),
        ).body!!.assignment.id

        assignmentController.saveMyHomeworkAssignmentSubmission(
            student,
            assignmentId,
            MaterialSubmissionRequest(content = fillGapAnswer(material.id, "cat", correct = true), submitted = true),
        )

        val row = assignmentController.getHomeworkAssignment(teacher, assignmentId).recipients.single()
        assertEquals(BigDecimal("10.00"), row.score)
        assertEquals(0, row.errorsCount)
        assertNull(row.progressTone)
        assertTrue(!row.showGroupIndicator)
    }

    @Test
    fun `homework can be created from expired scheduled lesson participants`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val material = fillGapMaterial(teacher)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = Instant.now().minusSeconds(7_200),
                scheduledEnd = Instant.now().minusSeconds(3_600),
                type = "GROUP",
                participantSubjects = listOf("student-1", "student-2"),
            ),
        ).body!!

        val homework = assignmentController.createHomeworkFromScheduledLesson(
            teacher,
            lesson.id,
            LessonHomeworkRequest(),
        ).body!!

        assertEquals(lesson.id, homework.assignment.sourceLessonId)
        assertEquals(2, homework.assignment.recipientCount)
        assertEquals(listOf(homework.assignment.id), assignmentController.listMyHomeworkAssignments(studentOne).map { assignment -> assignment.id })
        assertTrue(scheduleController.list(studentOne).none { scheduledLesson -> scheduledLesson.id == lesson.id })
    }

    @Test
    fun `student cannot access assignment assigned to another student`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val otherStudent = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        userProfileStore.currentUserId(otherStudent)
        val material = fillGapMaterial(teacher)
        val assignmentId = assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(materialId = material.id, studentSubjects = listOf("student-1")),
        ).body!!.assignment.id

        val error = assertFailsWith<ResponseStatusException> {
            assignmentController.getMyHomeworkAssignment(otherStudent, assignmentId)
        }

        assertEquals(HttpStatus.NOT_FOUND, error.statusCode)
    }

    private fun fillGapMaterial(teacher: JwtAuthenticationToken) =
        materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Animal homework",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Animals",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Complete",
                              "items": [
                                {
                                  "id": "item-cat",
                                  "prompt": "A small pet says meow: ___",
                                  "answer": "cat"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
                scoringRubric = objectMapper.readTree("""{"maxScore":10}"""),
            ),
        ).body!!

    private fun fillGapAnswer(materialId: UUID, value: String, correct: Boolean): JsonNode =
        objectMapper.readTree(
            """
            {
              "schemaVersion": 1,
              "materialId": "$materialId",
              "answers": {
                "gaps": {
                  "type": "fillGaps",
                  "items": {
                    "item-cat": "$value"
                  },
                  "attempts": {
                    "item-cat": [
                      { "value": "$value", "correct": $correct }
                    ]
                  }
                }
              }
            }
            """.trimIndent(),
        )

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
            .claim("name", username.replace('.', ' ').replaceFirstChar { char -> char.uppercase() })
            .build()

        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(role)))
    }
}
