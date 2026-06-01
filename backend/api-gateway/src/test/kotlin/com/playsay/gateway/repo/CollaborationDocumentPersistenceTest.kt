package com.playsay.gateway.repo

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.CollaborationDocumentEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonMaterialEntity
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
import org.springframework.dao.DataIntegrityViolationException
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:collaboration-document-persistence;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CollaborationDocumentPersistenceTest @Autowired constructor(
    private val appUserRepo: AppUserRepo,
    private val lessonRepo: LessonRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val collaborationDocumentRepo: CollaborationDocumentRepo,
    private val dataSource: DataSource,
) {
    private val now: Instant = Instant.parse("2026-06-01T09:00:00Z")

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@CollaborationDocumentPersistenceTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        collaborationDocumentRepo.deleteAllInBatch()
        lessonRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
    }

    @Test
    fun `repository finds individual and group documents separately and lists latest first`() {
        val teacher = user(subject = "teacher-1", username = "teacher.one", roles = "TEACHER")
        val student = user(subject = "student-1", username = "student.one", roles = "STUDENT")
        val material = material(teacher)
        val lesson = lesson(teacher, material)
        val individual = collaborationDocument(
            lesson = lesson,
            material = material,
            student = student,
            kind = "MATERIAL_WORK",
            scope = "INDIVIDUAL",
            yjsDocumentId = "lesson-${lesson.id}-student-${student.id}",
            updatedAt = now.plusSeconds(10),
        )
        val group = collaborationDocument(
            lesson = lesson,
            material = material,
            student = null,
            kind = "MATERIAL_WORK",
            scope = "GROUP",
            yjsDocumentId = "lesson-${lesson.id}-group",
            updatedAt = now.plusSeconds(20),
        )

        assertEquals(
            individual.id,
            assertNotNull(
                collaborationDocumentRepo.findByLessonIdAndMaterialIdAndStudentUserIdAndDocumentKindAndCollaborationScope(
                    lesson.id,
                    material.id,
                    student.id,
                    "MATERIAL_WORK",
                    "INDIVIDUAL",
                ),
            ).id,
        )
        assertEquals(
            group.id,
            assertNotNull(
                collaborationDocumentRepo.findByLessonIdAndMaterialIdAndStudentUserIdIsNullAndDocumentKindAndCollaborationScope(
                    lesson.id,
                    material.id,
                    "MATERIAL_WORK",
                    "GROUP",
                ),
            ).id,
        )
        assertEquals(
            listOf(group.id, individual.id),
            collaborationDocumentRepo.findByLessonIdAndMaterialIdOrderByUpdatedAtDesc(lesson.id, material.id).map { it.id },
        )
    }

    @Test
    fun `database constraints keep collaboration documents unique and scope-consistent`() {
        val teacher = user(subject = "teacher-1", username = "teacher.one", roles = "TEACHER")
        val student = user(subject = "student-1", username = "student.one", roles = "STUDENT")
        val secondStudent = user(subject = "student-2", username = "student.two", roles = "STUDENT")
        val material = material(teacher)
        val lesson = lesson(teacher, material)

        collaborationDocument(
            lesson = lesson,
            material = material,
            student = student,
            kind = "MATERIAL_WORK",
            scope = "INDIVIDUAL",
            yjsDocumentId = "unique-doc",
        )

        assertFailsWith<DataIntegrityViolationException> {
            collaborationDocument(
                lesson = lesson,
                material = material,
                student = student,
                kind = "MATERIAL_WORK",
                scope = "INDIVIDUAL",
                yjsDocumentId = "duplicate-business-key",
            )
        }
        assertFailsWith<DataIntegrityViolationException> {
            collaborationDocument(
                lesson = lesson,
                material = material,
                student = secondStudent,
                kind = "MATERIAL_WORK",
                scope = "INDIVIDUAL",
                yjsDocumentId = "unique-doc",
            )
        }
        assertFailsWith<DataIntegrityViolationException> {
            collaborationDocument(
                lesson = lesson,
                material = material,
                student = null,
                kind = "MATERIAL_WORK",
                scope = "INDIVIDUAL",
                yjsDocumentId = "individual-without-student",
            )
        }
        assertFailsWith<DataIntegrityViolationException> {
            collaborationDocument(
                lesson = lesson,
                material = material,
                student = student,
                kind = "MATERIAL_WORK",
                scope = "GROUP",
                yjsDocumentId = "group-with-student",
            )
        }
    }

    private fun user(
        subject: String,
        username: String,
        roles: String,
    ): AppUserEntity =
        appUserRepo.saveAndFlush(
            AppUserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = subject,
                username = username,
                email = "$username@example.com",
                name = username,
                roles = roles,
                createdAt = now,
                updatedAt = now,
            ),
        )

    private fun material(owner: AppUserEntity): LessonMaterialEntity =
        lessonMaterialRepo.saveAndFlush(
            LessonMaterialEntity(
                id = UUID.randomUUID(),
                ownerTeacherUserId = owner.id,
                title = "Collaboration material",
                description = "Material for collaboration",
                language = "en",
                cefrLevel = "A1",
                visibility = "PRIVATE",
                status = "PUBLISHED",
                document = """{"schemaVersion":1,"pages":[]}""",
                sourceMeta = "{}",
                scoringRubric = """{"maxScore":10}""",
                createdAt = now,
                updatedAt = now,
            ),
        )

    private fun lesson(teacher: AppUserEntity, material: LessonMaterialEntity): LessonEntity {
        val id = UUID.randomUUID()
        return lessonRepo.saveAndFlush(
            LessonEntity(
                id = id,
                materialId = material.id,
                teacherUserId = teacher.id,
                scheduledStart = now.plusSeconds(3_600),
                scheduledEnd = now.plusSeconds(7_200),
                status = "SCHEDULED",
                type = "GROUP",
                livekitRoomName = "lesson-$id",
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    private fun collaborationDocument(
        lesson: LessonEntity,
        material: LessonMaterialEntity,
        student: AppUserEntity?,
        kind: String,
        scope: String,
        yjsDocumentId: String,
        updatedAt: Instant = now,
    ): CollaborationDocumentEntity =
        collaborationDocumentRepo.saveAndFlush(
            CollaborationDocumentEntity(
                id = UUID.randomUUID(),
                lessonId = lesson.id,
                materialId = material.id,
                studentUserId = student?.id,
                documentKind = kind,
                collaborationScope = scope,
                yjsDocumentId = yjsDocumentId,
                snapshotJson = """{"text":"hello"}""",
                snapshotStorageKey = null,
                version = 0,
                createdAt = updatedAt.minusSeconds(60),
                updatedAt = updatedAt,
            ),
        )
}
