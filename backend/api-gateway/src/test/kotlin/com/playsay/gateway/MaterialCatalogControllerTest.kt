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

class MaterialCatalogControllerTest : MaterialControllerTestFixture() {
    @Autowired lateinit var parallelAnnotationRepo: LessonMaterialParallelAnnotationRepo
    @Test
    fun `parallel legacy annotations stay teacher-only and student writes are isolated`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val otherTeacher = authentication(subject = "teacher-other", username = "other.teacher", role = "ROLE_TEACHER")
        val studentA = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentB = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Synthetic document", status = "PUBLISHED")).body!!
        val lesson = scheduleController.create(teacher, ScheduledLessonRequest(
            materialId = material.id, scheduledStart = activeLessonStart(), scheduledEnd = activeLessonEnd(),
            type = "GROUP", participantSubjects = listOf("student-1", "student-2"),
        )).body!!
        val legacy = MaterialAnnotationRequest(objectMapper.readTree("""{"schemaVersion":1,"strokes":[{"id":"legacy"}]}"""))
        scheduledMaterialController.saveScheduledLessonMaterialAnnotation(studentA, lesson.id, legacy)
        val persistedLesson = lessonRepo.findById(lesson.id).orElseThrow()
        persistedLesson.workMode = "PARALLEL"
        lessonRepo.saveAndFlush(persistedLesson)
        lessonParticipantRepo.findByLessonId(lesson.id).forEach { it.materialId = material.id; lessonParticipantRepo.save(it) }
        lessonParticipantRepo.flush()

        assertEquals(0, scheduledMaterialController.scheduledLessonMaterialAnnotation(studentA, lesson.id).content["strokes"].size())
        assertEquals(0, scheduledMaterialController.scheduledLessonMaterialAnnotation(studentB, lesson.id).content["strokes"].size())
        // A pre-upgrade tab can still send its cached shared snapshot with a new stroke.
        val stale = MaterialAnnotationRequest(objectMapper.readTree("""{"schemaVersion":7,"elements":[{"id":"legacy","text":"modified old"},{"id":"fresh-a","text":"new"}]}"""))
        val savedFromStaleTab = scheduledMaterialController.saveScheduledLessonMaterialAnnotation(studentA, lesson.id, stale)
        assertEquals(listOf("fresh-a"), savedFromStaleTab.content["elements"].map { it["id"].asText() })
        assertEquals(listOf("fresh-a"), scheduledMaterialController.scheduledLessonMaterialAnnotation(studentA, lesson.id).content["elements"].map { it["id"].asText() })
        val snapshots = scheduledMaterialController.unallocatedParallelAnnotationSnapshots(teacher, lesson.id, material.id, 0)
        assertTrue(snapshots.headers.cacheControl!!.contains("no-store"))
        assertEquals("legacy", snapshots.body!!.items.single().content["elements"][0]["id"].asText())
        assertEquals("fresh-a", snapshots.body!!.items.single().content["elements"][1]["id"].asText())
        scheduledMaterialController.saveScheduledLessonMaterialAnnotation(studentA, lesson.id, stale)
        assertEquals(1, scheduledMaterialController.unallocatedParallelAnnotationSnapshots(teacher, lesson.id, material.id, 0).body!!.items.size)
        val anotherStaleTab = MaterialAnnotationRequest(objectMapper.readTree("""{"schemaVersion":7,"elements":[{"id":"legacy","text":"another version"},{"id":"fresh-other","text":"other tab"}]}"""))
        scheduledMaterialController.saveScheduledLessonMaterialAnnotation(studentA, lesson.id, anotherStaleTab)
        val retained = scheduledMaterialController.unallocatedParallelAnnotationSnapshots(teacher, lesson.id, material.id, 0).body!!.items
        assertEquals(2, retained.size)
        assertEquals(setOf("fresh-a", "fresh-other"), retained.map { it.content["elements"][1]["id"].asText() }.toSet())
        repeat(5) { index ->
            val extra = MaterialAnnotationRequest(objectMapper.readTree("""{"schemaVersion":7,"elements":[{"id":"legacy","text":"retained-$index"}]}"""))
            scheduledMaterialController.saveScheduledLessonMaterialAnnotation(studentA, lesson.id, extra)
        }
        val firstPage = scheduledMaterialController.unallocatedParallelAnnotationSnapshots(teacher, lesson.id, material.id, 0).body!!
        val secondPage = scheduledMaterialController.unallocatedParallelAnnotationSnapshots(teacher, lesson.id, material.id, 1).body!!
        assertEquals(5, firstPage.items.size)
        assertTrue(firstPage.hasNext)
        assertEquals(2, secondPage.items.size)
        assertFalse(secondPage.hasNext)
        assertEquals(7, (firstPage.items + secondPage.items).map { it.id }.toSet().size)
        assertEquals(HttpStatus.BAD_REQUEST, assertFailsWith<ResponseStatusException> {
            scheduledMaterialController.unallocatedParallelAnnotationSnapshots(teacher, lesson.id, material.id, -1)
        }.statusCode)
        assertFailsWith<ResponseStatusException> { scheduledMaterialController.unallocatedParallelAnnotationSnapshots(studentA, lesson.id, material.id, 0) }
        assertFailsWith<ResponseStatusException> { scheduledMaterialController.unallocatedParallelAnnotationSnapshots(otherTeacher, lesson.id, material.id, 0) }
        val a = MaterialAnnotationRequest(objectMapper.readTree("""{"schemaVersion":1,"strokes":[{"id":"student-a"}]}"""))
        val b = MaterialAnnotationRequest(objectMapper.readTree("""{"schemaVersion":1,"strokes":[{"id":"student-b"}]}"""))
        scheduledMaterialController.saveScheduledLessonMaterialAnnotation(studentA, lesson.id, a)
        scheduledMaterialController.saveScheduledLessonMaterialAnnotation(studentB, lesson.id, b)
        assertEquals("student-a", scheduledMaterialController.scheduledLessonMaterialAnnotation(studentA, lesson.id).content["strokes"][0]["id"].asText())
        assertEquals("student-b", scheduledMaterialController.scheduledLessonMaterialAnnotation(studentB, lesson.id).content["strokes"][0]["id"].asText())
        val legacyA = scheduledMaterialController.parallelStudentAnnotations(teacher, lesson.id, material.id, "student-1")
        assertTrue(legacyA.headers.cacheControl!!.contains("no-store"))
        assertEquals("student-a", legacyA.body!!.content["strokes"][0]["id"].asText())
        assertEquals("student-b", scheduledMaterialController.parallelStudentAnnotations(teacher, lesson.id, material.id, "student-2").body!!.content["strokes"][0]["id"].asText())
        assertFailsWith<ResponseStatusException> { scheduledMaterialController.parallelStudentAnnotations(studentB, lesson.id, material.id, "student-1") }
        assertFailsWith<ResponseStatusException> { scheduledMaterialController.parallelStudentAnnotations(otherTeacher, lesson.id, material.id, "student-1") }
        val archive = scheduledMaterialController.unallocatedParallelMaterialAnnotations(teacher, lesson.id, material.id)
        assertEquals(HttpStatus.OK, archive.statusCode)
        assertTrue(archive.headers.cacheControl!!.contains("no-store"))
        assertTrue(archive.headers.cacheControl!!.contains("private"))
        assertEquals("legacy", archive.body!!.content["strokes"][0]["id"].asText())
        assertEquals("legacy", objectMapper.readTree(lessonMaterialAnnotationRepo.findByLessonIdAndMaterialId(lesson.id, material.id)!!.content)["strokes"][0]["id"].asText())
        assertEquals(HttpStatus.FORBIDDEN, assertFailsWith<ResponseStatusException> {
            scheduledMaterialController.unallocatedParallelMaterialAnnotations(studentA, lesson.id, material.id)
        }.statusCode)
        assertEquals(HttpStatus.FORBIDDEN, assertFailsWith<ResponseStatusException> {
            scheduledMaterialController.unallocatedParallelMaterialAnnotations(otherTeacher, lesson.id, material.id)
        }.statusCode)
        assertEquals(HttpStatus.FORBIDDEN, assertFailsWith<ResponseStatusException> {
            scheduledMaterialController.scheduledLessonMaterialAnnotation(teacher, lesson.id)
        }.statusCode)
        val studentAId = appUserRepo.findByKeycloakSubject("student-1")!!.id
        // A legacy shape without usable identifiers cannot be safely partitioned, even on reads.
        val original = lessonMaterialAnnotationRepo.findByLessonIdAndMaterialId(lesson.id, material.id)!!
        original.content = """{"strokes":[{"points":[1]}]}"""
        lessonMaterialAnnotationRepo.saveAndFlush(original)
        val contaminated = parallelAnnotationRepo.findByLessonIdAndMaterialIdAndStudentUserId(lesson.id, material.id, studentAId)!!
        contaminated.content = """{"elements":[{"id":"possibly-private"}]}"""
        parallelAnnotationRepo.saveAndFlush(contaminated)
        val safeRead = scheduledMaterialController.scheduledLessonMaterialAnnotation(studentA, lesson.id)
        assertEquals(0, safeRead.content["strokes"].size())
        assertEquals(null, safeRead.content["elements"])
        assertEquals(0, scheduledMaterialController.parallelStudentAnnotations(teacher, lesson.id, material.id, "student-1").body!!.content["strokes"].size())
        val retainedPage = scheduledMaterialController.unallocatedParallelAnnotationSnapshots(teacher, lesson.id, material.id, 1).body!!
        assertTrue(retainedPage.items.any { it.content["elements"]?.get(0)?.get("id")?.asText() == "possibly-private" })
        persistedLesson.materialId = null
        lessonRepo.saveAndFlush(persistedLesson)
        lessonParticipantRepo.findByLessonId(lesson.id).forEach { it.materialId = null; lessonParticipantRepo.save(it) }
        lessonParticipantRepo.flush()
        val archivedMaterials = scheduledMaterialController.unallocatedAnnotationMaterials(teacher, lesson.id, 0)
        assertTrue(archivedMaterials.headers.cacheControl!!.contains("no-store"))
        assertEquals(listOf(material.id), archivedMaterials.body!!.materialIds)
        assertEquals(HttpStatus.OK, scheduledMaterialController.unallocatedParallelMaterialAnnotations(teacher, lesson.id, material.id).statusCode)
        assertFailsWith<ResponseStatusException> { scheduledMaterialController.unallocatedAnnotationMaterials(studentA, lesson.id, 0) }
        assertFailsWith<ResponseStatusException> { scheduledMaterialController.unallocatedAnnotationMaterials(otherTeacher, lesson.id, 0) }
        assertEquals(HttpStatus.BAD_REQUEST, assertFailsWith<ResponseStatusException> { scheduledMaterialController.unallocatedAnnotationMaterials(teacher, lesson.id, -1) }.statusCode)
        lessonParticipantRepo.deleteAll(lessonParticipantRepo.findByLessonId(lesson.id).filter { it.studentUserId == studentAId })
        lessonParticipantRepo.flush()
        assertFailsWith<ResponseStatusException> { scheduledMaterialController.scheduledLessonMaterialAnnotation(studentA, lesson.id) }
        assertFailsWith<ResponseStatusException> { scheduledMaterialController.parallelStudentAnnotations(teacher, lesson.id, material.id, "student-1") }
    }

    @Test
    fun `teacher creates private material and can publish it publicly`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")

        val created = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "  Food and travel  ",
                description = "Speaking lesson",
                cefrLevel = "B1",
                visibility = "PRIVATE",
                status = "DRAFT",
            ),
        ).body

        assertNotNull(created)
        assertEquals(HttpStatus.CREATED, materialCrudController.create(teacher, LessonMaterialRequest(title = "Second")).statusCode)
        assertEquals("Food and travel", created.title)
        assertEquals("B1", created.cefrLevel)
        assertEquals("PRIVATE", created.visibility)
        assertEquals(1, created.blockCount)
        assertEquals(emptyList(), materialCrudController.list(student))

        val published = materialCrudController.update(
            teacher,
            created.id,
            LessonMaterialRequest(
                title = created.title,
                description = created.description,
                language = created.language,
                cefrLevel = created.cefrLevel,
                visibility = "PUBLIC",
                status = "PUBLISHED",
                document = created.document,
                sourceMeta = created.sourceMeta,
                scoringRubric = created.scoringRubric,
            ),
        )

        assertEquals("PUBLIC", published.visibility)
        assertEquals(listOf(created.id), materialCrudController.list(student).map { material -> material.id })
        assertEquals(created.id, materialCrudController.get(student, created.id).id)
    }

    @Test
    fun `teacher stores reusable card curriculum metadata`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")

        val created = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Airport warm-up",
                status = "PUBLISHED",
                topicTags = listOf(" travelling ", "#airport", "travelling"),
                skillTags = listOf("vocabulary", " speaking ", "vocabulary"),
                ageBand = " 10-12 ",
                estimatedDurationMin = 7,
            ),
        ).body!!

        assertEquals(listOf("travelling", "airport"), created.topicTags)
        assertEquals(listOf("vocabulary", "speaking"), created.skillTags)
        assertEquals("10-12", created.ageBand)
        assertEquals(7, created.estimatedDurationMin)

        val updated = materialCrudController.update(
            teacher,
            created.id,
            LessonMaterialRequest(
                title = created.title,
                status = "PUBLISHED",
                topicTags = listOf("travel-basics"),
                skillTags = listOf("listening"),
                ageBand = null,
                estimatedDurationMin = null,
                document = created.document,
                sourceMeta = created.sourceMeta,
                scoringRubric = created.scoringRubric,
            ),
        )

        assertEquals(listOf("travel-basics"), updated.topicTags)
        assertEquals(listOf("listening"), updated.skillTags)
        assertEquals(null, updated.ageBand)
        assertEquals(null, updated.estimatedDurationMin)
    }

    @Test
    fun `material list respects admin teacher student visibility and archive status`() {
        val owner = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val otherTeacher = authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER")
        val admin = authentication(subject = "admin-1", username = "admin.one", role = "ROLE_ADMIN")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val ownerPrivate = materialCrudController.create(
            owner,
            LessonMaterialRequest(title = "Owner private", status = "PUBLISHED"),
        ).body!!
        val ownerDraft = materialCrudController.create(
            owner,
            LessonMaterialRequest(title = "Owner draft", status = "DRAFT"),
        ).body!!
        val publicMaterial = materialCrudController.create(
            owner,
            LessonMaterialRequest(title = "Public material", visibility = "PUBLIC", status = "PUBLISHED"),
        ).body!!
        val archived = materialCrudController.create(
            owner,
            LessonMaterialRequest(title = "Archived material", visibility = "PUBLIC", status = "PUBLISHED"),
        ).body!!
        val otherPrivate = materialCrudController.create(
            otherTeacher,
            LessonMaterialRequest(title = "Other private", status = "PUBLISHED"),
        ).body!!

        materialCrudController.archive(owner, archived.id)

        assertEquals(
            setOf(ownerPrivate.id, ownerDraft.id, publicMaterial.id, otherPrivate.id),
            materialCrudController.list(admin).map { material -> material.id }.toSet(),
        )
        assertEquals(
            setOf(ownerPrivate.id, ownerDraft.id, publicMaterial.id),
            materialCrudController.list(owner).map { material -> material.id }.toSet(),
        )
        assertEquals(listOf(publicMaterial.id), materialCrudController.list(student).map { material -> material.id })
        val studentPrivateError = assertFailsWith<ResponseStatusException> {
            materialCrudController.get(student, ownerPrivate.id)
        }
        assertEquals(HttpStatus.NOT_FOUND, studentPrivateError.statusCode)
    }

    @Test
    fun `student sees private material through assigned scheduled lesson`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Private classroom material",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Articles",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "warmup",
                              "type": "fillGaps",
                              "title": "Articles",
                              "items": [
                                {
                                  "prompt": "It is ... apple.",
                                  "answer": "an",
                                  "options": ["a", "an", "-"]
                                }
                              ]
                            },
                            {
                              "id": "pictures",
                              "type": "matchingPairs",
                              "title": "Pictures",
                              "pairs": [
                                {
                                  "id": "pair-apple",
                                  "left": "apple",
                                  "right": "apple",
                                  "imagePrompt": "child-friendly workbook apple illustration",
                                  "imageAlt": "apple"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
            ),
        ).body!!
        val generatedMaterial = materialAiController.generateImages(
            teacher,
            material.id,
            MaterialGenerateImagesRequest(maxImages = 1),
        )
        val asset = materialAssetController.listAssets(teacher, material.id).single()
        assertEquals(material.id, generatedMaterial.id)

        val course = courseController.create(teacher, CourseRequest(title = "Course", isPublished = true)).body!!
        val lessonTemplate = courseController.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "Lesson", materialId = material.id),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplate.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val scheduledMaterial = scheduledMaterialController.scheduledLessonMaterial(student, lesson.id)

        assertEquals(material.id, scheduledMaterial.id)
        assertEquals("Private classroom material", scheduledMaterial.title)
        assertEquals(listOf(asset.id), materialAssetController.listAssets(student, material.id).map { item -> item.id })
        val assetContent = materialAssetController.assetContent(student, material.id, asset.id)
        assertEquals(HttpStatus.OK, assetContent.statusCode)
        assertEquals("no-store", assetContent.headers.cacheControl)
        assertEquals("image/svg+xml", assetContent.headers.contentType?.toString())
        assertTrue(assertNotNull(assetContent.body).decodeToString().contains("<svg"))
        val otherStudent = authentication(subject = "student-other", username = "student.other", role = "ROLE_STUDENT")
        val forbiddenAsset = assertFailsWith<ResponseStatusException> {
            materialAssetController.assetContent(otherStudent, material.id, asset.id)
        }
        assertEquals(HttpStatus.NOT_FOUND, forbiddenAsset.statusCode)
        val submission = scheduledMaterialController.saveScheduledLessonMaterialSubmission(
            student,
            lesson.id,
            MaterialSubmissionRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "materialId": "${material.id}",
                      "answers": {
                        "warmup": {
                          "type": "fillGaps",
                          "items": {
                            "It is ... apple.-0": "an"
                          }
                        },
                        "pictures": {
                          "type": "matchingPairs",
                          "matches": {
                            "pair-apple": "pair-apple"
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )
        assertEquals(material.id, submission.materialId)
        assertEquals(lesson.id, submission.lessonId)
        assertEquals("student-1", submission.userSubject)
        assertEquals("Student one", submission.userName)
        assertNotNull(submission.submittedAt)
        assertEquals(0, BigDecimal.TEN.compareTo(assertNotNull(submission.score)))
        assertEquals(0, submission.errorsCount)
        assertEquals("an", submission.content["answers"]["warmup"]["items"]["It is ... apple.-0"].asText())
        assertEquals(submission.id, scheduledMaterialController.scheduledLessonMaterialSubmission(student, lesson.id).id)
        val teacherSubmissions = scheduledMaterialController.scheduledLessonMaterialSubmissions(teacher, lesson.id)
        assertEquals(1, teacherSubmissions.size)
        assertEquals(submission.id, teacherSubmissions.single().id)
        assertEquals("student-1", teacherSubmissions.single().userSubject)
        assertEquals(0, BigDecimal.TEN.compareTo(assertNotNull(teacherSubmissions.single().score)))
        assertEquals("an", teacherSubmissions.single().content["answers"]["warmup"]["items"]["It is ... apple.-0"].asText())
        val studentMonitorError = assertFailsWith<ResponseStatusException> {
            scheduledMaterialController.scheduledLessonMaterialSubmissions(student, lesson.id)
        }
        assertEquals(HttpStatus.FORBIDDEN, studentMonitorError.statusCode)
        val annotation = scheduledMaterialController.saveScheduledLessonMaterialAnnotation(
            student,
            lesson.id,
            MaterialAnnotationRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "strokes": [
                        {
                          "id": "stroke-1",
                          "color": "#ff5c00",
                          "points": [
                            { "x": 10, "y": 10 },
                            { "x": 20, "y": 25 }
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
            ),
        )
        assertEquals(material.id, annotation.materialId)
        assertEquals(lesson.id, annotation.lessonId)
        assertEquals("stroke-1", annotation.content["strokes"][0]["id"].asText())
        val teacherAnnotation = scheduledMaterialController.scheduledLessonMaterialAnnotation(teacher, lesson.id)
        assertEquals(annotation.id, teacherAnnotation.id)
        assertEquals(20, teacherAnnotation.content["strokes"][0]["points"][1]["x"].asInt())
        val directReadError = assertFailsWith<ResponseStatusException> {
            materialCrudController.get(student, material.id)
        }
        assertEquals(HttpStatus.NOT_FOUND, directReadError.statusCode)
    }
}
