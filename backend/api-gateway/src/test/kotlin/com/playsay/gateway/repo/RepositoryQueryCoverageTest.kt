package com.playsay.gateway.repo

import com.playsay.gateway.repo.schedule.*

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.CourseEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonMaterialAnnotationEntity
import com.playsay.gateway.entity.LessonMaterialEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import com.playsay.gateway.entity.LessonTemplateEntity
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.entity.SubmissionEntity
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:datarepo-query-coverage;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Transactional
class RepositoryQueryCoverageTest @Autowired constructor(
    private val appUserRepo: AppUserRepo,
    private val courseRepo: CourseRepo,
    private val lessonTemplateRepo: LessonTemplateRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val assignmentRepo: AssignmentRepo,
    private val submissionRepo: SubmissionRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val materialAssetRepo: MaterialAssetRepo,
    private val lessonMaterialAnnotationRepo: LessonMaterialAnnotationRepo,
    private val dataSource: DataSource,
) {
    private val now: Instant = Instant.parse("2026-05-28T10:00:00Z")
    private val excludedStatuses = listOf("CANCELLED", "COMPLETED")

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@RepositoryQueryCoverageTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
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
    }

    @Test
    fun `app user repository queries cover subject lookup bulk lookup ordering and role filtering`() {
        user(subject = "teacher-1", username = "z.teacher", roles = "TEACHER", displayName = "Teacher Z")
        user(subject = "student-1", username = "a.student", roles = "STUDENT", displayName = "Student A")
        user(subject = "admin-1", username = "m.admin", roles = "ADMIN", displayName = "Admin M")

        assertEquals("a.student", appUserRepo.findByKeycloakSubject("student-1")?.username)
        assertEquals(
            setOf("student-1", "teacher-1"),
            appUserRepo.findByKeycloakSubjectIn(listOf("student-1", "teacher-1"))
                .map { appUser -> appUser.keycloakSubject }
                .toSet(),
        )
        assertEquals(listOf("a.student", "m.admin", "z.teacher"), appUserRepo.findAllOrdered().map { it.username })
        assertEquals(listOf("a.student"), appUserRepo.findByRoleOrdered("STUDENT").map { it.username })
    }

    @Test
    fun `course and lesson template repository queries cover summaries ordering material joins and deletes`() {
        val teacher = user(subject = "teacher-1", username = "teacher.one", roles = "TEACHER")
        val material = material(teacher, title = "Alphabet cards", visibility = "PUBLIC", status = "PUBLISHED")
        val published = course(title = "Published course", published = true, creator = teacher)
        val draft = course(title = "Draft course", published = false, creator = teacher)
        val secondLesson = lessonTemplate(
            course = published,
            title = "Second lesson",
            material = material,
            orderIndex = 2,
            createdAt = now.plusSeconds(20),
        )
        val firstLesson = lessonTemplate(
            course = published,
            title = "First lesson",
            orderIndex = 1,
            createdAt = now.plusSeconds(10),
        )
        lessonTemplate(course = draft, title = "Draft lesson", orderIndex = 1)

        assertEquals(setOf(published.id, draft.id), courseRepo.findCourseSummaries().map { it.course.id }.toSet())
        assertEquals(listOf(published.id), courseRepo.findPublishedCourseSummaries().map { it.course.id })
        assertEquals(2L, courseRepo.findCourseSummaryById(published.id)?.lessonCount)
        assertEquals(listOf(firstLesson.id, secondLesson.id), lessonTemplateRepo.findLessonRowsByCourseId(published.id).map { it.id })
        assertEquals("Alphabet cards", lessonTemplateRepo.findLessonRowByCourseIdAndId(published.id, secondLesson.id)?.materialTitle)
        assertEquals(firstLesson.id, lessonTemplateRepo.findByIdAndCourseId(firstLesson.id, published.id)?.id)
        assertEquals(1L, lessonTemplateRepo.deleteByIdAndCourseId(firstLesson.id, published.id))
        assertEquals(1L, lessonTemplateRepo.deleteByCourseId(published.id))
        assertEquals(emptyList(), lessonTemplateRepo.findLessonRowsByCourseId(published.id))
    }

    @Test
    fun `lesson and participant repository queries cover schedule visibility joinability material lookup and attendance`() {
        val teacher = user(subject = "teacher-1", username = "teacher.one", roles = "TEACHER", displayName = "Teacher One")
        val studentOne = user(subject = "student-1", username = "student.one", roles = "STUDENT", displayName = "Student One")
        val studentTwo = user(subject = "student-2", username = "student.two", roles = "STUDENT", displayName = "Student Two")
        val directMaterial = material(teacher, title = "Direct material", visibility = "PRIVATE", status = "PUBLISHED")
        val templateMaterial = material(teacher, title = "Template material", visibility = "PRIVATE", status = "PUBLISHED")
        val course = course(title = "Speaking course", published = true, creator = teacher)
        val template = lessonTemplate(course = course, title = "Template lesson", material = templateMaterial, orderIndex = 1)
        val directLesson = lesson(
            teacher = teacher,
            template = template,
            material = directMaterial,
            status = "IN_PROGRESS",
            scheduledStart = now.plusSeconds(3_600),
            scheduledEnd = now.plusSeconds(7_200),
        )
        val templateMaterialLesson = lesson(
            teacher = teacher,
            template = template,
            material = null,
            status = "SCHEDULED",
            scheduledStart = now.plusSeconds(10_800),
            scheduledEnd = now.plusSeconds(14_400),
        )
        val otherStudentLesson = lesson(
            teacher = teacher,
            template = template,
            material = directMaterial,
            status = "SCHEDULED",
            scheduledStart = now.plusSeconds(18_000),
            scheduledEnd = now.plusSeconds(21_600),
        )
        val expiredLesson = lesson(
            teacher = teacher,
            template = template,
            material = directMaterial,
            status = "SCHEDULED",
            scheduledStart = now.minusSeconds(7_200),
            scheduledEnd = now.minusSeconds(3_600),
        )
        val cancelledLesson = lesson(
            teacher = teacher,
            template = template,
            material = directMaterial,
            status = "CANCELLED",
            scheduledStart = now.plusSeconds(25_200),
            scheduledEnd = now.plusSeconds(28_800),
        )
        participant(directLesson, studentOne, attendanceStatus = "INVITED")
        participant(templateMaterialLesson, studentOne, attendanceStatus = "INVITED")
        participant(otherStudentLesson, studentTwo, attendanceStatus = "INVITED")
        participant(expiredLesson, studentOne, attendanceStatus = "INVITED")
        participant(cancelledLesson, studentOne, attendanceStatus = "INVITED")

        assertEquals(
            setOf(directLesson.id, templateMaterialLesson.id, otherStudentLesson.id, expiredLesson.id, cancelledLesson.id),
            lessonRepo.findScheduleRowsForManager().map { row -> row.id }.toSet(),
        )
        assertEquals(
            listOf(directLesson.id, templateMaterialLesson.id),
            lessonRepo.findScheduleRowsForStudent("student-1", now.minusSeconds(600), excludedStatuses).map { row -> row.id },
        )
        val directRow = assertNotNull(lessonRepo.findScheduleRowById(directLesson.id))
        assertEquals("Speaking course", directRow.courseTitle)
        assertEquals("Template lesson", directRow.lessonTitle)
        assertEquals("Direct material", directRow.materialTitle)
        assertEquals(directMaterial.id, lessonRepo.findScheduledMaterialLookup(directLesson.id)?.materialId)
        assertEquals(templateMaterial.id, lessonRepo.findScheduledMaterialLookup(templateMaterialLesson.id)?.materialId)
        assertEquals(
            directLesson.id,
            lessonRepo.findJoinableForManager(directLesson.id, now.plusSeconds(3_600), now.minusSeconds(600), excludedStatuses)?.id,
        )
        assertEquals(
            directLesson.id,
            lessonRepo.findJoinableForStudent(directLesson.id, "student-1", now.plusSeconds(3_600), now.minusSeconds(600), "IN_PROGRESS")?.id,
        )
        assertNull(lessonRepo.findJoinableForStudent(directLesson.id, "student-2", now.plusSeconds(3_600), now.minusSeconds(600), "IN_PROGRESS"))
        assertNull(lessonRepo.findJoinableForManager(cancelledLesson.id, now.plusSeconds(3_600), now.minusSeconds(600), excludedStatuses))
        assertNull(lessonRepo.findJoinableForManager(expiredLesson.id, now.plusSeconds(3_600), now.minusSeconds(600), excludedStatuses))
        assertEquals(directLesson.id, lessonRepo.findByLivekitRoomName("lesson-${directLesson.id}")?.id)
        assertEquals(1L, lessonRepo.countActiveMaterialParticipant(directMaterial.id, "student-1", now.plusSeconds(3_600), now.minusSeconds(600), excludedStatuses))
        assertEquals(1L, lessonRepo.countActiveMaterialParticipant(directMaterial.id, "student-2", now.plusSeconds(21_600), now.minusSeconds(600), excludedStatuses))
        assertEquals(0L, lessonRepo.countActiveMaterialParticipant(directMaterial.id, "student-missing", now.plusSeconds(3_600), now.minusSeconds(600), excludedStatuses))

        assertEquals(
            listOf("student-1"),
            lessonParticipantRepo.findParticipantRowsByLessonIds(listOf(directLesson.id)).map { row -> row.subject },
        )
        assertEquals(1L, lessonParticipantRepo.countByLessonIdAndStudentSubject(directLesson.id, "student-1"))
        assertEquals(0L, lessonParticipantRepo.countByLessonIdAndStudentSubject(directLesson.id, "student-2"))
        assertEquals(
            studentOne.id,
            lessonParticipantRepo.findByRoomNameAndStudentSubject("lesson-${directLesson.id}", "student-1")?.studentUserId,
        )
        assertEquals("INVITED", lessonParticipantRepo.findByLessonId(directLesson.id).single().attendanceStatus)
        assertEquals(1L, lessonParticipantRepo.deleteByLessonId(directLesson.id))
        assertEquals(emptyList(), lessonParticipantRepo.findByLessonId(directLesson.id))
    }

    @Test
    fun `assignment and submission repository queries cover first assignment latest submission rows and projections`() {
        val teacher = user(subject = "teacher-1", username = "teacher.one", roles = "TEACHER")
        val studentOne = user(subject = "student-1", username = "student.one", roles = "STUDENT", displayName = "Student One")
        val studentTwo = user(subject = "student-2", username = "student.two", roles = "STUDENT", displayName = "Student Two")
        val material = material(teacher, title = "Submission material", visibility = "PRIVATE", status = "PUBLISHED")
        val scheduledLesson = lesson(teacher = teacher, material = material, status = "SCHEDULED")
        val earliestAssignment = assignment(
            lesson = scheduledLesson,
            material = material,
            type = "MATERIAL_WORK",
            createdAt = now.minusSeconds(60),
        )
        val practicePlanId = UUID.randomUUID()
        val sourcePracticeId = UUID.randomUUID()
        val vocabularyAssignment = assignment(
            lesson = scheduledLesson,
            material = material,
            type = "HOMEWORK",
            createdAt = now.minusSeconds(30),
            teacher = teacher,
            practicePlanId = practicePlanId,
            sourcePracticeId = sourcePracticeId,
        )
        assignment(
            lesson = scheduledLesson,
            material = material,
            type = "MATERIAL_WORK",
            createdAt = now,
        )
        val olderSubmission = submission(
            assignment = earliestAssignment,
            lesson = scheduledLesson,
            student = studentOne,
            content = """{"answers":{"old":"value"}}""",
            score = BigDecimal("7.50"),
            errorsCount = 2,
            updatedAt = now.plusSeconds(10),
        )
        val latestSubmission = submission(
            assignment = earliestAssignment,
            lesson = scheduledLesson,
            student = studentOne,
            content = """{"answers":{"latest":"value"}}""",
            score = BigDecimal("9.00"),
            errorsCount = 1,
            updatedAt = now.plusSeconds(20),
        )
        val secondStudentSubmission = submission(
            assignment = earliestAssignment,
            lesson = scheduledLesson,
            student = studentTwo,
            content = """{"answers":{"second":"student"}}""",
            score = BigDecimal("8.00"),
            errorsCount = 0,
            updatedAt = now.plusSeconds(15),
        )

        assertEquals(
            earliestAssignment.id,
            assignmentRepo.findFirstByLessonIdAndMaterialIdAndMaterialBlockIdIsNullAndTypeOrderByCreatedAtAsc(
                scheduledLesson.id,
                material.id,
                "MATERIAL_WORK",
            )?.id,
        )
        assertEquals(
            vocabularyAssignment.id,
            assignmentRepo.findByTeacherUserIdAndPracticePlanId(teacher.id, practicePlanId)?.id,
        )
        assertEquals(
            vocabularyAssignment.id,
            assignmentRepo.findByTeacherUserIdAndSourceVocabularyPracticeId(teacher.id, sourcePracticeId)?.id,
        )
        assertEquals(
            latestSubmission.id,
            submissionRepo.findFirstByAssignmentIdAndLessonIdAndStudentUserIdOrderByUpdatedAtDesc(
                earliestAssignment.id,
                scheduledLesson.id,
                studentOne.id,
            )?.id,
        )
        assertEquals(
            listOf(latestSubmission.id, secondStudentSubmission.id, olderSubmission.id),
            submissionRepo.findMaterialSubmissionRows(earliestAssignment.id, scheduledLesson.id).map { row -> row.id },
        )
        assertEquals(
            listOf(latestSubmission.id, olderSubmission.id),
            submissionRepo.findMaterialSubmissionRowsByStudent(
                earliestAssignment.id,
                scheduledLesson.id,
                studentOne.id,
            ).map { row -> row.id },
        )
        val row = assertNotNull(submissionRepo.findMaterialSubmissionRowById(latestSubmission.id))
        assertEquals("student-1", row.userSubject)
        assertEquals("Student One", row.userName)
        assertEquals(0, BigDecimal("9.00").compareTo(row.score))
        assertEquals(1, row.errorsCount)
    }

    @Test
    fun `lesson material repository queries cover visibility status owner projections and active participant count`() {
        val owner = user(subject = "teacher-1", username = "teacher.one", roles = "TEACHER", displayName = "Teacher One")
        val otherTeacher = user(subject = "teacher-2", username = "teacher.two", roles = "TEACHER", displayName = "Teacher Two")
        val student = user(subject = "student-1", username = "student.one", roles = "STUDENT")
        val ownerPrivate = material(owner, title = "Owner private", visibility = "PRIVATE", status = "PUBLISHED", updatedAt = now.plusSeconds(10))
        val ownerDraft = material(owner, title = "Owner draft", visibility = "PRIVATE", status = "DRAFT", updatedAt = now.plusSeconds(20))
        val otherPrivate = material(otherTeacher, title = "Other private", visibility = "PRIVATE", status = "PUBLISHED", updatedAt = now.plusSeconds(30))
        val publicPublished = material(owner, title = "Public published", visibility = "PUBLIC", status = "PUBLISHED", updatedAt = now.plusSeconds(40))
        val archived = material(owner, title = "Archived", visibility = "PUBLIC", status = "ARCHIVED", updatedAt = now.plusSeconds(50))
        val activeLesson = lesson(
            teacher = owner,
            material = ownerPrivate,
            status = "SCHEDULED",
            scheduledStart = now.minusSeconds(600),
            scheduledEnd = now.plusSeconds(3_600),
        )
        participant(activeLesson, student)

        assertTrue(lessonMaterialRepo.existsByIdAndStatusNot(publicPublished.id, "ARCHIVED"))
        assertFalse(lessonMaterialRepo.existsByIdAndStatusNot(archived.id, "ARCHIVED"))
        assertEquals(1L, lessonMaterialRepo.countVisibleActiveForUser(ownerPrivate.id, owner.id, "ARCHIVED", "PUBLIC", "PUBLISHED"))
        assertEquals(0L, lessonMaterialRepo.countVisibleActiveForUser(otherPrivate.id, owner.id, "ARCHIVED", "PUBLIC", "PUBLISHED"))
        assertEquals(
            setOf(ownerPrivate.id, ownerDraft.id, otherPrivate.id, publicPublished.id),
            lessonMaterialRepo.findRowsForAdmin("ARCHIVED").map { row -> row.id }.toSet(),
        )
        assertEquals(
            setOf(ownerPrivate.id, ownerDraft.id, publicPublished.id),
            lessonMaterialRepo.findRowsForTeacher(owner.id, "ARCHIVED", "PUBLIC", "PUBLISHED").map { row -> row.id }.toSet(),
        )
        assertEquals(listOf(publicPublished.id), lessonMaterialRepo.findPublicPublishedRows("PUBLIC", "PUBLISHED").map { row -> row.id })
        val row = assertNotNull(lessonMaterialRepo.findRowById(ownerPrivate.id))
        assertEquals("teacher-1", row.ownerTeacherSubject)
        assertEquals("Teacher One", row.ownerTeacherName)
        assertEquals(1L, lessonRepo.countActiveMaterialParticipant(ownerPrivate.id, "student-1", now.plusSeconds(600), now.minusSeconds(600), excludedStatuses))
    }

    @Test
    fun `asset and annotation repository queries cover material filters ordering scoped delete and lookup`() {
        val teacher = user(subject = "teacher-1", username = "teacher.one", roles = "TEACHER")
        val firstMaterial = material(teacher, title = "First material", visibility = "PRIVATE", status = "PUBLISHED")
        val secondMaterial = material(teacher, title = "Second material", visibility = "PRIVATE", status = "PUBLISHED")
        val oldAsset = asset(firstMaterial, kind = "GENERATED_IMAGE", createdAt = now.minusSeconds(60))
        val newAsset = asset(firstMaterial, kind = "GENERATED_IMAGE", createdAt = now.plusSeconds(60))
        val otherMaterialAsset = asset(secondMaterial, kind = "GENERATED_IMAGE", createdAt = now)
        val lesson = lesson(teacher = teacher, material = firstMaterial, status = "SCHEDULED")
        val annotation = annotation(lesson, firstMaterial)

        assertEquals(setOf(oldAsset.id, newAsset.id), materialAssetRepo.findByMaterialId(firstMaterial.id).map { it.id }.toSet())
        assertEquals(
            listOf(newAsset.id, oldAsset.id),
            materialAssetRepo.findByMaterialIdOrderByCreatedAtDesc(firstMaterial.id).map { it.id },
        )
        assertEquals(0L, materialAssetRepo.deleteByIdAndMaterialId(otherMaterialAsset.id, firstMaterial.id))
        assertTrue(materialAssetRepo.existsById(otherMaterialAsset.id))
        assertEquals(1L, materialAssetRepo.deleteByIdAndMaterialId(oldAsset.id, firstMaterial.id))
        assertFalse(materialAssetRepo.existsById(oldAsset.id))
        assertEquals(annotation.id, lessonMaterialAnnotationRepo.findByLessonIdAndMaterialId(lesson.id, firstMaterial.id)?.id)
        assertNull(lessonMaterialAnnotationRepo.findByLessonIdAndMaterialId(lesson.id, secondMaterial.id))
    }

    private fun user(
        subject: String,
        username: String,
        roles: String,
        displayName: String? = null,
    ): AppUserEntity =
        appUserRepo.saveAndFlush(
            AppUserEntity(
                id = UUID.randomUUID(),
                keycloakSubject = subject,
                username = username,
                email = "$username@example.com",
                name = displayName ?: username,
                roles = roles,
                displayName = displayName,
                createdAt = now,
                updatedAt = now,
            ),
        )

    private fun material(
        owner: AppUserEntity?,
        title: String,
        visibility: String,
        status: String,
        updatedAt: Instant = now,
    ): LessonMaterialEntity =
        lessonMaterialRepo.saveAndFlush(
            LessonMaterialEntity(
                id = UUID.randomUUID(),
                ownerTeacherUserId = owner?.id,
                title = title,
                description = "$title description",
                language = "en",
                cefrLevel = "A1",
                visibility = visibility,
                status = status,
                document = """{"schemaVersion":1,"pages":[]}""",
                sourceMeta = "{}",
                scoringRubric = """{"maxScore":10}""",
                createdAt = updatedAt.minusSeconds(60),
                updatedAt = updatedAt,
            ),
        )

    private fun course(title: String, published: Boolean, creator: AppUserEntity): CourseEntity =
        courseRepo.saveAndFlush(
            CourseEntity(
                id = UUID.randomUUID(),
                title = title,
                description = "$title description",
                language = "en",
                level = "A1",
                isPublished = published,
                createdByUserId = creator.id,
                createdAt = now,
                updatedAt = now,
            ),
        )

    private fun lessonTemplate(
        course: CourseEntity,
        title: String,
        material: LessonMaterialEntity? = null,
        orderIndex: Int? = null,
        createdAt: Instant = now,
    ): LessonTemplateEntity =
        lessonTemplateRepo.saveAndFlush(
            LessonTemplateEntity(
                id = UUID.randomUUID(),
                courseId = course.id,
                title = title,
                orderIndex = orderIndex,
                plannedDurationMin = 45,
                materialId = material?.id,
                createdAt = createdAt,
                updatedAt = createdAt,
            ),
        )

    private fun lesson(
        teacher: AppUserEntity,
        template: LessonTemplateEntity? = null,
        material: LessonMaterialEntity? = null,
        status: String,
        scheduledStart: Instant = now.plusSeconds(3_600),
        scheduledEnd: Instant? = now.plusSeconds(7_200),
    ): LessonEntity {
        val id = UUID.randomUUID()
        return lessonRepo.saveAndFlush(
            LessonEntity(
                id = id,
                lessonTemplateId = template?.id,
                materialId = material?.id,
                inheritTemplateMaterial = template != null && material == null,
                teacherUserId = teacher.id,
                scheduledStart = scheduledStart,
                scheduledEnd = scheduledEnd,
                actualStart = null,
                actualEnd = null,
                status = status,
                type = "GROUP",
                livekitRoomName = "lesson-$id",
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    private fun participant(
        lesson: LessonEntity,
        student: AppUserEntity,
        attendanceStatus: String? = null,
    ): LessonParticipantEntity =
        lessonParticipantRepo.saveAndFlush(
            LessonParticipantEntity(
                id = UUID.randomUUID(),
                lessonId = lesson.id,
                studentUserId = student.id,
                joinedAt = if (attendanceStatus == "PRESENT") now.plusSeconds(60) else null,
                leftAt = if (attendanceStatus == "PRESENT") now.plusSeconds(120) else null,
                attendanceStatus = attendanceStatus,
            ),
        )

    private fun assignment(
        lesson: LessonEntity,
        material: LessonMaterialEntity,
        type: String,
        createdAt: Instant,
        teacher: AppUserEntity? = null,
        practicePlanId: UUID? = null,
        sourcePracticeId: UUID? = null,
    ): AssignmentEntity =
        assignmentRepo.saveAndFlush(
            AssignmentEntity(
                id = UUID.randomUUID(),
                lessonId = lesson.id,
                teacherUserId = teacher?.id,
                materialId = material.id,
                materialBlockId = null,
                practicePlanId = practicePlanId,
                sourceVocabularyPracticeId = sourcePracticeId,
                title = "Material work",
                instructions = null,
                type = type,
                payload = """{"materialId":"${material.id}"}""",
                maxScore = BigDecimal("10.00"),
                createdAt = createdAt,
                updatedAt = createdAt,
            ),
        )

    private fun submission(
        assignment: AssignmentEntity,
        lesson: LessonEntity,
        student: AppUserEntity,
        content: String,
        score: BigDecimal,
        errorsCount: Int,
        updatedAt: Instant,
    ): SubmissionEntity =
        submissionRepo.saveAndFlush(
            SubmissionEntity(
                id = UUID.randomUUID(),
                assignmentId = assignment.id,
                studentUserId = student.id,
                lessonId = lesson.id,
                yjsDocumentId = "yjs-${student.keycloakSubject}",
                content = content,
                score = score,
                errorsCount = errorsCount,
                submittedAt = updatedAt,
                createdAt = updatedAt.minusSeconds(60),
                updatedAt = updatedAt,
            ),
        )

    private fun asset(
        material: LessonMaterialEntity,
        kind: String,
        createdAt: Instant,
    ): MaterialAssetEntity =
        materialAssetRepo.saveAndFlush(
            MaterialAssetEntity(
                id = UUID.randomUUID(),
                materialId = material.id,
                kind = kind,
                storageKey = "material-assets/${material.id}/${UUID.randomUUID()}.svg",
                externalUrl = null,
                provider = "memory",
                metadata = """{"tags":["repo-test"]}""",
                createdAt = createdAt,
            ),
        )

    private fun annotation(
        lesson: LessonEntity,
        material: LessonMaterialEntity,
    ): LessonMaterialAnnotationEntity =
        lessonMaterialAnnotationRepo.saveAndFlush(
            LessonMaterialAnnotationEntity(
                id = UUID.randomUUID(),
                lessonId = lesson.id,
                materialId = material.id,
                content = """{"schemaVersion":1,"strokes":[]}""",
                createdAt = now,
                updatedAt = now,
            ),
        )
}
