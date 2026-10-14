package com.playsay.gateway

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.controller.AssignmentController
import com.playsay.gateway.controller.MaterialAssetController
import com.playsay.gateway.controller.MaterialCrudController
import com.playsay.gateway.controller.ScheduledLessonController
import com.playsay.gateway.dto.HomeworkAssignmentRequest
import com.playsay.gateway.dto.LessonHomeworkRequest
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.ScheduledLessonRequest
import com.playsay.gateway.dto.VocabularyAssignmentPreparationResponse
import com.playsay.gateway.dto.VocabularyAssignmentSessionRef
import com.playsay.gateway.dto.VocabularyHomeworkRequest
import com.playsay.gateway.dto.VocabularyHomeworkCompletionPolicy
import com.playsay.gateway.dto.VocabularyHomeworkReviewAction
import com.playsay.gateway.dto.VocabularyHomeworkReviewRequest
import com.playsay.gateway.dto.VocabularyAssignmentProgressUpdateRequest
import com.playsay.gateway.entity.TeacherDelegationEntity
import com.playsay.gateway.entity.TeacherDelegationStudentEntity
import com.playsay.gateway.entity.AssignmentRecipientEntity
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.CourseRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.repo.LessonTemplateRepo
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.repo.SubmissionRepo
import com.playsay.gateway.repo.AssignmentIntegrationOutboxRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.repo.TeacherDelegationStudentRepo
import com.playsay.gateway.repo.VocabularyAssignmentProgressEventRepo
import com.playsay.gateway.realtime.AssignmentChangedEvent
import com.playsay.gateway.service.assignment.AssignmentStore
import com.playsay.gateway.service.assignment.VOCABULARY_ASSIGNMENT_PREPARE_EVENT
import com.playsay.gateway.service.UserProfileStore
import java.math.BigDecimal
import java.time.Duration
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
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.context.event.ApplicationEvents
import org.springframework.test.context.event.RecordApplicationEvents
import org.springframework.web.server.ResponseStatusException
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:assignment-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=false",
        "playsay.storage.provider=memory",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@RecordApplicationEvents
class AssignmentControllerTest @Autowired constructor(
    private val assignmentController: AssignmentController,
    private val assignmentStore: AssignmentStore,
    private val materialAssetController: MaterialAssetController,
    private val materialCrudController: MaterialCrudController,
    private val scheduleController: ScheduledLessonController,
    private val userProfileStore: UserProfileStore,
    private val submissionRepo: SubmissionRepo,
    private val assignmentIntegrationOutboxRepo: AssignmentIntegrationOutboxRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val assignmentRepo: AssignmentRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val lessonRepo: LessonRepo,
    private val lessonTemplateRepo: LessonTemplateRepo,
    private val courseRepo: CourseRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val materialAssetRepo: MaterialAssetRepo,
    private val appUserRepo: AppUserRepo,
    private val teacherDelegationRepo: TeacherDelegationRepo,
    private val teacherDelegationStudentRepo: TeacherDelegationStudentRepo,
    private val vocabularyProgressEventRepo: VocabularyAssignmentProgressEventRepo,
    private val dataSource: DataSource,
) {
    @Autowired
    private lateinit var applicationEvents: ApplicationEvents

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
        assignmentIntegrationOutboxRepo.deleteAllInBatch()
        vocabularyProgressEventRepo.deleteAllInBatch()
        submissionRepo.deleteAllInBatch()
        assignmentRecipientRepo.deleteAllInBatch()
        assignmentRepo.deleteAllInBatch()
        lessonParticipantRepo.deleteAllInBatch()
        lessonRepo.deleteAllInBatch()
        lessonTemplateRepo.deleteAllInBatch()
        courseRepo.deleteAllInBatch()
        materialAssetRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        teacherDelegationStudentRepo.deleteAllInBatch()
        teacherDelegationRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
        appUserRepo.seedPrimaryTeacherWithStudents()
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

        val unopenedSummary = assignmentController.listMyHomeworkAssignments(studentOne)
            .single { assignment -> assignment.id == created.assignment.id }
        assertEquals("NOT_STARTED", unopenedSummary.mySubmissionState)
        assertNull(unopenedSummary.myScore)
        assertNull(unopenedSummary.mySubmittedAt)
        assertNull(unopenedSummary.mySubmissionUpdatedAt)

        val studentDetail = assignmentController.getMyHomeworkAssignment(studentOne, created.assignment.id)
        assertEquals(material.id, studentDetail.material.id)
        assertNull(studentDetail.submission.score)
        assertNull(studentDetail.submission.errorsCount)
        assertNull(studentDetail.submission.progressTone)

        val openedSummary = assignmentController.listMyHomeworkAssignments(studentOne)
            .single { assignment -> assignment.id == created.assignment.id }
        assertEquals("DRAFT", openedSummary.mySubmissionState)
        assertEquals(studentDetail.submission.updatedAt, openedSummary.mySubmissionUpdatedAt)

        val teacherView = assignmentController.getHomeworkAssignment(teacher, created.assignment.id)
        val opened = teacherView.recipients.single { recipient -> recipient.studentSubject == "student-1" }
        assertTrue(opened.hasSubmission)
        assertNull(opened.score)
        assertNull(opened.progressTone)
        assertEquals(0, teacherView.assignment.scoredCount)
    }

    @Test
    fun `homework recipient can read private material assets until recipient is archived`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val recipient = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val unrelated = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(recipient)
        userProfileStore.currentUserId(unrelated)
        val material = fillGapMaterial(teacher)
        val uploaded = materialAssetController.uploadImageAsset(
            teacher,
            material.id,
            MockMultipartFile(
                "file",
                "homework.svg",
                "image/svg+xml",
                """<svg xmlns="http://www.w3.org/2000/svg" width="20" height="40"><rect width="20" height="40"/></svg>""".toByteArray(),
            ),
        ).body!!
        val assignment = assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(
                materialId = material.id,
                studentSubjects = listOf("student-1"),
            ),
        ).body!!.assignment

        assertEquals(listOf(uploaded.id), materialAssetController.listAssets(recipient, material.id).map { asset -> asset.id })
        assertEquals(
            "image/svg+xml",
            materialAssetController.assetContent(recipient, material.id, uploaded.id).headers.contentType.toString(),
        )
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertFailsWith<ResponseStatusException> {
                materialAssetController.listAssets(unrelated, material.id)
            }.statusCode,
        )

        val recipientRow = assignmentRecipientRepo.findByAssignmentIdOrderByCreatedAtAsc(assignment.id).single()
        recipientRow.archivedAt = Instant.now()
        assignmentRecipientRepo.saveAndFlush(recipientRow)

        assertEquals(
            HttpStatus.NOT_FOUND,
            assertFailsWith<ResponseStatusException> {
                materialAssetController.listAssets(recipient, material.id)
            }.statusCode,
        )
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
    fun `mixed recipient homework is projected to each authorized teacher without leaking other students`() {
        val admin = authentication(subject = "admin-1", username = "admin.one", role = "ROLE_ADMIN")
        val primaryTeacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val secondTeacher = authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER")
        val delegate = authentication(subject = "delegate-1", username = "delegate.one", role = "ROLE_TEACHER")
        val unrelated = authentication(subject = "unrelated-1", username = "unrelated.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(admin)
        val primaryTeacherId = userProfileStore.currentUserId(primaryTeacher)
        val secondTeacherId = userProfileStore.currentUserId(secondTeacher)
        val delegateId = userProfileStore.currentUserId(delegate)
        userProfileStore.currentUserId(unrelated)
        val studentOneId = userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        appUserRepo.assignStudentToTeacher("student-2", "teacher-2")

        val now = Instant.now()
        val delegation = teacherDelegationRepo.saveAndFlush(
            TeacherDelegationEntity(
                primaryTeacherUserId = primaryTeacherId,
                delegateTeacherUserId = delegateId,
                startsAt = now.minus(Duration.ofHours(1)),
                endsAt = now.plus(Duration.ofDays(1)),
                createdByUserId = primaryTeacherId,
                createdAt = now,
            ),
        )
        teacherDelegationStudentRepo.saveAndFlush(
            TeacherDelegationStudentEntity(
                delegationId = delegation.id,
                studentUserId = studentOneId,
                createdAt = now,
            ),
        )
        val secondTeacherDelegation = teacherDelegationRepo.saveAndFlush(
            TeacherDelegationEntity(
                primaryTeacherUserId = primaryTeacherId,
                delegateTeacherUserId = secondTeacherId,
                startsAt = now.minus(Duration.ofHours(1)),
                endsAt = now.plus(Duration.ofDays(1)),
                createdByUserId = primaryTeacherId,
                createdAt = now,
            ),
        )
        teacherDelegationStudentRepo.saveAndFlush(
            TeacherDelegationStudentEntity(
                delegationId = secondTeacherDelegation.id,
                studentUserId = studentOneId,
                createdAt = now,
            ),
        )

        val material = fillGapMaterial(admin)
        val assignmentId = assignmentController.createHomeworkAssignment(
            admin,
            HomeworkAssignmentRequest(materialId = material.id, studentSubjects = listOf("student-1", "student-2")),
        ).body!!.assignment.id
        val studentOneSubmission = assignmentController.saveMyHomeworkAssignmentSubmission(
            studentOne,
            assignmentId,
            MaterialSubmissionRequest(content = fillGapAnswer(material.id, "dog", correct = false), submitted = true),
        )
        val studentTwoSubmission = assignmentController.saveMyHomeworkAssignmentSubmission(
            studentTwo,
            assignmentId,
            MaterialSubmissionRequest(content = fillGapAnswer(material.id, "cat", correct = true), submitted = true),
        )

        val adminSummary = assignmentController.listHomeworkAssignments(admin).single { it.id == assignmentId }
        assertEquals(2, adminSummary.recipientCount)
        assertEquals(2, adminSummary.scoredCount)
        assertEquals(BigDecimal("5.00"), adminSummary.averageScore)

        listOf(primaryTeacher, delegate).forEach { viewer ->
            val summary = assignmentController.listHomeworkAssignments(viewer).single { it.id == assignmentId }
            assertEquals(1, summary.recipientCount)
            assertEquals(1, summary.scoredCount)
            assertEquals(BigDecimal("0.00"), summary.averageScore)
            val detail = assignmentController.getHomeworkAssignment(viewer, assignmentId)
            assertEquals(listOf("student-1"), detail.recipients.map { it.studentSubject })
            assertTrue(detail.recipients.none { it.showGroupIndicator })
            assertEquals(studentOneSubmission.id, assignmentController.getSubmittedHomeworkResult(viewer, assignmentId, studentOneSubmission.id).submission.id)
            assertEquals(
                HttpStatus.NOT_FOUND,
                assertFailsWith<ResponseStatusException> {
                    assignmentController.getSubmittedHomeworkResult(viewer, assignmentId, studentTwoSubmission.id)
                }.statusCode,
            )
        }

        val delegatedSecondTeacherSummary = assignmentController.listHomeworkAssignments(secondTeacher).single { it.id == assignmentId }
        assertEquals(2, delegatedSecondTeacherSummary.recipientCount)
        assertEquals(BigDecimal("5.00"), delegatedSecondTeacherSummary.averageScore)

        secondTeacherDelegation.revokedAt = Instant.now()
        teacherDelegationRepo.saveAndFlush(secondTeacherDelegation)

        val secondTeacherSummary = assignmentController.listHomeworkAssignments(secondTeacher).single { it.id == assignmentId }
        assertEquals(1, secondTeacherSummary.recipientCount)
        assertEquals(BigDecimal("10.00"), secondTeacherSummary.averageScore)
        assertEquals(
            listOf("student-2"),
            assignmentController.getHomeworkAssignment(secondTeacher, assignmentId).recipients.map { it.studentSubject },
        )
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertFailsWith<ResponseStatusException> {
                assignmentController.getSubmittedHomeworkResult(secondTeacher, assignmentId, studentOneSubmission.id)
            }.statusCode,
        )

        assertTrue(assignmentController.listHomeworkAssignments(unrelated).none { it.id == assignmentId })
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertFailsWith<ResponseStatusException> {
                assignmentController.getHomeworkAssignment(unrelated, assignmentId)
            }.statusCode,
        )
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
    fun `homework lists skip assignments whose material was archived`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = fillGapMaterial(teacher)
        val assignmentId = assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(materialId = material.id, studentSubjects = listOf("student-1")),
        ).body!!.assignment.id

        assertEquals(listOf(assignmentId), assignmentController.listHomeworkAssignments(teacher).map { assignment -> assignment.id })
        assertEquals(listOf(assignmentId), assignmentController.listMyHomeworkAssignments(student).map { assignment -> assignment.id })

        assertEquals(HttpStatus.NO_CONTENT, materialCrudController.archive(teacher, material.id).statusCode)

        assertEquals(emptyList(), assignmentController.listHomeworkAssignments(teacher).map { assignment -> assignment.id })
        assertEquals(emptyList(), assignmentController.listMyHomeworkAssignments(student).map { assignment -> assignment.id })
        val teacherError = assertFailsWith<ResponseStatusException> {
            assignmentController.getHomeworkAssignment(teacher, assignmentId)
        }
        val studentError = assertFailsWith<ResponseStatusException> {
            assignmentController.getMyHomeworkAssignment(student, assignmentId)
        }
        assertEquals(HttpStatus.NOT_FOUND, teacherError.statusCode)
        assertEquals(HttpStatus.NOT_FOUND, studentError.statusCode)
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

    @Test
    fun `expanded assignment status constraint accepts vocabulary lifecycle statuses`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)

        val preparing = assignmentStore.createVocabularyHomework(
            teacher,
            VocabularyHomeworkRequest(
                studentSubjects = listOf("student-1"),
                wordLimit = 3,
            ),
        )

        assertEquals("PREPARING", preparing.assignment.status)
        val assignmentId = preparing.assignment.id
        assertEquals(
            "PENDING",
            assignmentIntegrationOutboxRepo.findByAssignmentIdAndEventType(
                assignmentId,
                VOCABULARY_ASSIGNMENT_PREPARE_EVENT,
            )?.status,
        )
        listOf("FAILED", "ARCHIVED", "ACTIVE", "PREPARING").forEach { status ->
            dataSource.connection.use { connection ->
                connection.prepareStatement("update assignment set status = ? where id = ?").use { statement ->
                    statement.setString(1, status)
                    statement.setObject(2, assignmentId)
                    assertEquals(1, statement.executeUpdate())
                }
            }
        }
        assignmentStore.applyVocabularyPreparation(
            assignmentId,
            VocabularyAssignmentPreparationResponse(
                practiceId = UUID.randomUUID(),
                sessions = listOf(
                    VocabularyAssignmentSessionRef(
                        sessionId = UUID.randomUUID(),
                        ownerSubject = "student-1",
                    ),
                ),
            ),
            actorSubject = "teacher-1",
        )
        assertEquals("ACTIVE", assignmentController.getHomeworkAssignment(teacher, assignmentId).assignment.status)
        assertEquals(
            "COMPLETED",
            assignmentIntegrationOutboxRepo.findByAssignmentIdAndEventType(
                assignmentId,
                VOCABULARY_ASSIGNMENT_PREPARE_EVENT,
            )?.status,
        )
    }

    @Test
    fun `teacher review completion is versioned idempotent and separate from diagnostic accuracy`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        userProfileStore.currentUserId(authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT"))
        val created = assignmentStore.createVocabularyHomework(
            teacher,
            VocabularyHomeworkRequest(
                studentSubjects = listOf("student-1"),
                completionPolicy = VocabularyHomeworkCompletionPolicy.TEACHER_REVIEW,
            ),
        )
        val practiceId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        assignmentStore.applyVocabularyPreparation(
            created.assignment.id,
            VocabularyAssignmentPreparationResponse(practiceId, listOf(VocabularyAssignmentSessionRef(sessionId, "student-1"))),
            "teacher-1",
        )
        val eventId = UUID.randomUUID()
        val progress = VocabularyAssignmentProgressUpdateRequest(
            eventId = eventId,
            sessionId = sessionId,
            ownerSubject = "student-1",
            revision = 1,
            state = "AWAITING_REVIEW",
            completionRatio = BigDecimal.ONE,
            accuracy = BigDecimal("0.25"),
            difficultWordCount = 3,
            learnerSnapshotId = sessionId,
            distinctGradedPrompts = 8,
            distinctEntries = 4,
            hintsUsed = 2,
            activeDurationMs = 42_000,
            masteryRatio = BigDecimal("0.50"),
            completionPolicy = VocabularyHomeworkCompletionPolicy.TEACHER_REVIEW,
            completionPolicyVersion = "vocabulary-homework-v1",
            updatedAt = Instant.now(),
        )

        assignmentStore.updateVocabularyProgress(created.assignment.id, progress)
        assignmentStore.updateVocabularyProgress(created.assignment.id, progress)
        val awaiting = assignmentStore.teacherDetail(teacher, created.assignment.id).recipients.single()
        assertEquals("AWAITING_REVIEW", awaiting.activityState)
        assertEquals(8, awaiting.distinctGradedPrompts)
        assertEquals(0, BigDecimal("0.25").compareTo(awaiting.accuracy))
        assertEquals(1, vocabularyProgressEventRepo.count())

        val accepted = assignmentStore.reviewVocabularyHomework(
            teacher,
            created.assignment.id,
            "student-1",
            VocabularyHomeworkReviewRequest(VocabularyHomeworkReviewAction.ACCEPT, "Enough meaningful work"),
        ).recipients.single()
        assertEquals("COMPLETED", accepted.activityState)
        assertEquals("ACCEPT", accepted.reviewState)
        assertEquals("Enough meaningful work", accepted.reviewNote)
    }

    @Test
    fun `vocabulary homework progress and review are scoped to the exact accessible recipient`() {
        val primaryTeacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val secondTeacher = authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER")
        val delegate = authentication(subject = "delegate-1", username = "delegate.one", role = "ROLE_TEACHER")
        val primaryTeacherId = userProfileStore.currentUserId(primaryTeacher)
        userProfileStore.currentUserId(secondTeacher)
        val delegateId = userProfileStore.currentUserId(delegate)
        val studentOne = appUserRepo.findByKeycloakSubject("student-1")!!
        val studentTwo = appUserRepo.findByKeycloakSubject("student-2")!!
        appUserRepo.assignStudentToTeacher("student-2", "teacher-2")
        val now = Instant.now()
        val delegation = teacherDelegationRepo.saveAndFlush(
            TeacherDelegationEntity(
                primaryTeacherUserId = primaryTeacherId,
                delegateTeacherUserId = delegateId,
                startsAt = now.minus(Duration.ofHours(1)),
                endsAt = now.plus(Duration.ofDays(1)),
                createdByUserId = primaryTeacherId,
                createdAt = now,
            ),
        )
        teacherDelegationStudentRepo.saveAndFlush(
            TeacherDelegationStudentEntity(
                delegationId = delegation.id,
                studentUserId = studentOne.id,
                createdAt = now,
            ),
        )

        val created = assignmentStore.createVocabularyHomework(
            primaryTeacher,
            VocabularyHomeworkRequest(
                studentSubjects = listOf("student-1"),
                completionPolicy = VocabularyHomeworkCompletionPolicy.TEACHER_REVIEW,
            ),
        )
        assignmentRecipientRepo.saveAndFlush(
            AssignmentRecipientEntity(
                assignmentId = created.assignment.id,
                studentUserId = studentTwo.id,
                assignedAt = now,
                createdAt = now,
                updatedAt = now,
            ),
        )
        val studentOneSession = UUID.randomUUID()
        val studentTwoSession = UUID.randomUUID()
        assignmentStore.applyVocabularyPreparation(
            created.assignment.id,
            VocabularyAssignmentPreparationResponse(
                practiceId = UUID.randomUUID(),
                sessions = listOf(
                    VocabularyAssignmentSessionRef(studentOneSession, "student-1"),
                    VocabularyAssignmentSessionRef(studentTwoSession, "student-2"),
                ),
            ),
            actorSubject = "teacher-1",
        )
        assignmentStore.updateVocabularyProgress(
            created.assignment.id,
            VocabularyAssignmentProgressUpdateRequest(
                eventId = UUID.randomUUID(),
                sessionId = studentOneSession,
                ownerSubject = "student-1",
                revision = 1,
                state = "AWAITING_REVIEW",
                completionRatio = BigDecimal.ONE,
                accuracy = BigDecimal("0.50"),
                difficultWordCount = 2,
                updatedAt = now,
            ),
        )
        assignmentStore.updateVocabularyProgress(
            created.assignment.id,
            VocabularyAssignmentProgressUpdateRequest(
                eventId = UUID.randomUUID(),
                sessionId = studentTwoSession,
                ownerSubject = "student-2",
                revision = 1,
                state = "AWAITING_REVIEW",
                completionRatio = BigDecimal.ONE,
                accuracy = BigDecimal("0.90"),
                difficultWordCount = 8,
                updatedAt = now,
            ),
        )

        val delegateSummary = assignmentController.listHomeworkAssignments(delegate).single { it.id == created.assignment.id }
        assertEquals(1, delegateSummary.recipientCount)
        assertEquals(1, delegateSummary.scoredCount)
        assertEquals(BigDecimal("2.00"), delegateSummary.averageErrorsCount)
        assertEquals(
            listOf("student-1"),
            assignmentController.getHomeworkAssignment(delegate, created.assignment.id).recipients.map { it.studentSubject },
        )
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertFailsWith<ResponseStatusException> {
                assignmentStore.reviewVocabularyHomework(
                    delegate,
                    created.assignment.id,
                    "student-2",
                    VocabularyHomeworkReviewRequest(VocabularyHomeworkReviewAction.ACCEPT),
                )
            }.statusCode,
        )
        val reviewed = assignmentStore.reviewVocabularyHomework(
            delegate,
            created.assignment.id,
            "student-1",
            VocabularyHomeworkReviewRequest(VocabularyHomeworkReviewAction.ACCEPT),
        )
        assertEquals(listOf("student-1"), reviewed.recipients.map { it.studentSubject })
        assertEquals("COMPLETED", reviewed.recipients.single().activityState)

        val secondTeacherDetail = assignmentController.getHomeworkAssignment(secondTeacher, created.assignment.id)
        assertEquals(listOf("student-2"), secondTeacherDetail.recipients.map { it.studentSubject })
        assertEquals(1, secondTeacherDetail.assignment.recipientCount)
        assertEquals(BigDecimal("8.00"), secondTeacherDetail.assignment.averageErrorsCount)
    }

    @Test
    fun `assignment changes preserve realtime visibility and change type`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = fillGapMaterial(teacher)

        val created = assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(materialId = material.id, studentSubjects = listOf("student-1")),
        ).body!!.assignment

        val event = applicationEvents.stream(AssignmentChangedEvent::class.java)
            .filter { it.assignmentId == created.id }
            .findFirst()
            .orElseThrow()
        assertEquals("CREATED", event.change)
        assertEquals(setOf("teacher-1", "student-1"), event.visibleSubjects)
    }

    @Test
    fun `submitted homework result preserves annotations and is visible only to assignment managers`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val delegate = authentication(subject = "delegate-1", username = "delegate.one", role = "ROLE_TEACHER")
        val unrelated = authentication(subject = "unrelated-1", username = "unrelated.one", role = "ROLE_TEACHER")
        val studentId = userProfileStore.currentUserId(student)
        val delegateId = userProfileStore.currentUserId(delegate)
        userProfileStore.currentUserId(unrelated)
        val teacherId = appUserRepo.findByKeycloakSubject("teacher-1")!!.id
        val now = Instant.now()
        val delegation = teacherDelegationRepo.saveAndFlush(
            TeacherDelegationEntity(
                primaryTeacherUserId = teacherId,
                delegateTeacherUserId = delegateId,
                startsAt = now.minus(Duration.ofHours(1)),
                endsAt = now.plus(Duration.ofDays(1)),
                createdByUserId = teacherId,
                createdAt = now,
            ),
        )
        teacherDelegationStudentRepo.saveAndFlush(
            TeacherDelegationStudentEntity(
                delegationId = delegation.id,
                studentUserId = studentId,
                createdAt = now,
            ),
        )
        val material = fillGapMaterial(teacher)
        val uploaded = materialAssetController.uploadImageAsset(
            teacher,
            material.id,
            MockMultipartFile(
                "file",
                "annotated.svg",
                "image/svg+xml",
                """<svg xmlns="http://www.w3.org/2000/svg" width="20" height="40"/>""".toByteArray(),
            ),
        ).body!!
        val assignmentId = assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(materialId = material.id, studentSubjects = listOf("student-1")),
        ).body!!.assignment.id
        val content = fillGapAnswer(material.id, "cat", correct = true).deepCopy<JsonNode>()
        (content as com.fasterxml.jackson.databind.node.ObjectNode).set<JsonNode>(
            "annotations",
            objectMapper.readTree(
                """
                {
                  "schemaVersion": 7,
                  "activePageId": "page-1",
                  "coordinateSpace": "material-page",
                  "elements": [
                    {
                      "id": "stroke-1",
                      "kind": "stroke",
                      "pageId": "page-1",
                      "anchorId": "image-1",
                      "color": "#ff5c00",
                      "strokeWidth": 8,
                      "createdAt": 1,
                      "points": [
                        {"pageId":"page-1","anchorId":"image-1","x":100,"y":200},
                        {"pageId":"page-1","anchorId":"image-1","x":300,"y":400}
                      ]
                    }
                  ]
                }
                """.trimIndent(),
            ),
        )

        val draft = assignmentController.saveMyHomeworkAssignmentSubmission(
            student,
            assignmentId,
            MaterialSubmissionRequest(content = content, submitted = false),
        )
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertFailsWith<ResponseStatusException> {
                assignmentController.getSubmittedHomeworkResult(teacher, assignmentId, draft.id)
            }.statusCode,
        )

        val submitted = assignmentController.saveMyHomeworkAssignmentSubmission(
            student,
            assignmentId,
            MaterialSubmissionRequest(content = content, submitted = true),
        )
        val ownerResult = assignmentController.getSubmittedHomeworkResult(teacher, assignmentId, submitted.id)
        assertEquals(7, ownerResult.submission.content["annotations"]["schemaVersion"].asInt())
        assertEquals("stroke-1", ownerResult.submission.content["annotations"]["elements"][0]["id"].asText())
        assertEquals(material.id, ownerResult.material.id)
        assertEquals(submitted.id, assignmentController.getSubmittedHomeworkResult(delegate, assignmentId, submitted.id).submission.id)
        assertEquals(listOf(uploaded.id), materialAssetController.listAssets(delegate, material.id).map { asset -> asset.id })
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertFailsWith<ResponseStatusException> {
                assignmentController.getSubmittedHomeworkResult(unrelated, assignmentId, submitted.id)
            }.statusCode,
        )

        val foreignAssignmentId = assignmentController.createHomeworkAssignment(
            teacher,
            HomeworkAssignmentRequest(materialId = material.id, studentSubjects = listOf("student-1")),
        ).body!!.assignment.id
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertFailsWith<ResponseStatusException> {
                assignmentController.getSubmittedHomeworkResult(teacher, foreignAssignmentId, submitted.id)
            }.statusCode,
        )
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
