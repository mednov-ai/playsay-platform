package com.playsay.gateway

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.controller.CollaborationDocumentController
import com.playsay.gateway.controller.MaterialCrudController
import com.playsay.gateway.controller.ScheduledLessonController
import com.playsay.gateway.dto.CreateCollaborationDocumentRequest
import com.playsay.gateway.dto.FinalizeCollaborationDocumentRequest
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.SaveCollaborationSnapshotRequest
import com.playsay.gateway.dto.ScheduledLessonRequest
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.CollaborationDocumentRepo
import com.playsay.gateway.repo.CourseRepo
import com.playsay.gateway.repo.LessonMaterialAnnotationRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.repo.LessonTemplateRepo
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.repo.SubmissionRepo
import com.playsay.gateway.service.UserProfileStore
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
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
        "spring.datasource.url=jdbc:h2:mem:collaboration-document-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=false",
        "playsay.collaboration.websocket-url=wss://online.play-and-say.ru/collab/ws",
        "playsay.collaboration.token-secret=01234567890123456789012345678901",
        "playsay.collaboration.token-ttl-seconds=900",
        "playsay.collaboration.service-token=service-token-01234567890123456789",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CollaborationDocumentControllerTest @Autowired constructor(
    private val collaborationController: CollaborationDocumentController,
    private val scheduleController: ScheduledLessonController,
    private val materialCrudController: MaterialCrudController,
    private val userProfileStore: UserProfileStore,
    private val collaborationDocumentRepo: CollaborationDocumentRepo,
    private val lessonMaterialAnnotationRepo: LessonMaterialAnnotationRepo,
    private val materialAssetRepo: MaterialAssetRepo,
    private val submissionRepo: SubmissionRepo,
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

    private fun activeLessonStart(): Instant = Instant.now().minusSeconds(300)

    private fun activeLessonEnd(): Instant = Instant.now().plusSeconds(2_400)

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@CollaborationDocumentControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        collaborationDocumentRepo.deleteAllInBatch()
        lessonMaterialAnnotationRepo.deleteAllInBatch()
        materialAssetRepo.deleteAllInBatch()
        submissionRepo.deleteAllInBatch()
        assignmentRepo.deleteAllInBatch()
        lessonParticipantRepo.deleteAllInBatch()
        lessonRepo.deleteAllInBatch()
        lessonTemplateRepo.deleteAllInBatch()
        courseRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
        appUserRepo.seedPrimaryTeacherWithStudents()
    }

    @Test
    fun `student creates and gets current individual document idempotently`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentUserId = userProfileStore.currentUserId(student)
        val classroom = classroom(teacher, listOf("student-1"))

        val created = collaborationController.createCurrent(
            student,
            classroom.lessonId,
            CreateCollaborationDocumentRequest(
                materialId = classroom.materialId,
                documentKind = "MATERIAL_WORK",
                scope = "INDIVIDUAL",
            ),
        )
        val fetched = collaborationController.current(
            student,
            classroom.lessonId,
            classroom.materialId,
            "MATERIAL_WORK",
            "INDIVIDUAL",
        )

        assertEquals(created.id, fetched.id)
        assertEquals(classroom.lessonId, created.lessonId)
        assertEquals(classroom.materialId, created.materialId)
        assertEquals(studentUserId, created.studentUserId)
        assertEquals("MATERIAL_WORK", created.documentKind)
        assertEquals("INDIVIDUAL", created.scope)
        assertTrue(created.yjsDocumentId.contains("student:$studentUserId"))
    }

    @Test
    fun `group current document creation is idempotent under concurrent student requests`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val classroom = classroom(teacher, listOf("student-1", "student-2"))
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val futures = listOf(studentOne, studentTwo).map { authentication ->
                executor.submit(
                    Callable {
                        start.await(5, TimeUnit.SECONDS)
                        collaborationController.createCurrent(
                            authentication,
                            classroom.lessonId,
                            CreateCollaborationDocumentRequest(classroom.materialId, "MATERIAL_WORK", "GROUP"),
                        )
                    },
                )
            }
            start.countDown()
            val documents = futures.map { future -> future.get(10, TimeUnit.SECONDS) }

            assertEquals(1, documents.map { document -> document.id }.toSet().size)
            assertEquals(
                1,
                collaborationDocumentRepo.findByLessonIdAndMaterialIdOrderByUpdatedAtDesc(
                    classroom.lessonId,
                    classroom.materialId,
                ).size,
            )
            assertEquals("GROUP", documents.first().scope)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `student list is limited to own individual and group while teacher sees all lesson documents`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val classroom = classroom(teacher, listOf("student-1", "student-2"))
        val firstIndividual = collaborationController.createCurrent(
            studentOne,
            classroom.lessonId,
            CreateCollaborationDocumentRequest(classroom.materialId, "MATERIAL_WORK", "INDIVIDUAL"),
        )
        val secondIndividual = collaborationController.createCurrent(
            studentTwo,
            classroom.lessonId,
            CreateCollaborationDocumentRequest(classroom.materialId, "MATERIAL_WORK", "INDIVIDUAL"),
        )
        val group = collaborationController.createCurrent(
            studentOne,
            classroom.lessonId,
            CreateCollaborationDocumentRequest(classroom.materialId, "MATERIAL_WORK", "GROUP"),
        )

        val visibleToStudent = collaborationController.list(studentOne, classroom.lessonId, classroom.materialId)
        val visibleToTeacher = collaborationController.list(teacher, classroom.lessonId, classroom.materialId)

        assertEquals(setOf(firstIndividual.id, group.id), visibleToStudent.map { document -> document.id }.toSet())
        assertEquals(
            setOf(firstIndividual.id, secondIndividual.id, group.id),
            visibleToTeacher.map { document -> document.id }.toSet(),
        )
    }

    @Test
    fun `student cannot save another students individual document`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val classroom = classroom(teacher, listOf("student-1", "student-2"))
        val secondIndividual = collaborationController.createCurrent(
            studentTwo,
            classroom.lessonId,
            CreateCollaborationDocumentRequest(classroom.materialId, "MATERIAL_WORK", "INDIVIDUAL"),
        )

        val error = assertFailsWith<ResponseStatusException> {
            collaborationController.saveSnapshot(
                studentOne,
                classroom.lessonId,
                secondIndividual.id,
                SaveCollaborationSnapshotRequest(objectMapper.readTree("""{"answers":{"one":"two"}}""")),
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `save snapshot increments version and finalize creates material submission`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val classroom = classroom(teacher, listOf("student-1"))
        val document = collaborationController.createCurrent(
            student,
            classroom.lessonId,
            CreateCollaborationDocumentRequest(classroom.materialId, "MATERIAL_WORK", "INDIVIDUAL"),
        )
        val snapshot = objectMapper.readTree(
            """
            {
              "schemaVersion": 1,
              "materialId": "${classroom.materialId}",
              "answers": {"prompt-1": "hello"}
            }
            """.trimIndent(),
        )

        val saved = collaborationController.saveSnapshot(
            student,
            classroom.lessonId,
            document.id,
            SaveCollaborationSnapshotRequest(snapshot),
        )
        val finalized = collaborationController.finalize(
            student,
            classroom.lessonId,
            document.id,
            FinalizeCollaborationDocumentRequest(submitted = true),
        )

        assertEquals(1L, saved.version)
        assertEquals(snapshot, saved.snapshot)
        assertEquals(document.id, saved.id)
        assertEquals(classroom.materialId, finalized.materialId)
        assertEquals(snapshot, finalized.content)
        assertNotNull(finalized.submittedAt)
    }

    @Test
    fun `collaboration service token can save room snapshot without user jwt`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val classroom = classroom(teacher, listOf("student-1"))
        val document = collaborationController.createCurrent(
            student,
            classroom.lessonId,
            CreateCollaborationDocumentRequest(classroom.materialId, "MATERIAL_WORK", "GROUP"),
        )
        val snapshot = objectMapper.readTree("""{"yjsUpdate":"AQID"}""")

        val saved = collaborationController.saveSnapshot(
            authentication = null,
            serviceToken = "service-token-01234567890123456789",
            lessonId = classroom.lessonId,
            documentId = document.id,
            request = SaveCollaborationSnapshotRequest(snapshot),
        )

        assertEquals(1L, saved.version)
        assertEquals(snapshot, saved.snapshot)
        assertEquals(document.id, saved.id)
        val restored = collaborationController.getSnapshotForService(
            lessonId = classroom.lessonId,
            documentId = document.id,
            serviceToken = "service-token-01234567890123456789",
        )
        assertEquals(snapshot, restored.snapshot)
    }

    @Test
    fun `token endpoint returns short lived collaboration room token`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val classroom = classroom(teacher, listOf("student-1"))
        val document = collaborationController.createCurrent(
            student,
            classroom.lessonId,
            CreateCollaborationDocumentRequest(classroom.materialId, "MATERIAL_WORK", "GROUP"),
        )

        val token = collaborationController.token(student, classroom.lessonId, document.id)

        assertEquals(document.id, token.documentId)
        assertEquals(document.yjsDocumentId, token.yjsDocumentId)
        assertEquals("wss://online.play-and-say.ru/collab/ws", token.websocketUrl)
        assertTrue(token.token.count { char -> char == '.' } == 2)
        assertTrue(token.expiresAt.isAfter(Instant.now()))
    }

    private fun classroom(teacher: JwtAuthenticationToken, participantSubjects: List<String>): ClassroomFixture {
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Collaboration material", status = "PUBLISHED"),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                type = "GROUP",
                participantSubjects = participantSubjects,
            ),
        ).body!!
        return ClassroomFixture(lessonId = lesson.id, materialId = material.id)
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

    private data class ClassroomFixture(
        val lessonId: UUID,
        val materialId: UUID,
    )
}
