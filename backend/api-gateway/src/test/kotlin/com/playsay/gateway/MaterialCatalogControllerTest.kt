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
        assertEquals("image/svg+xml", assetContent.headers.contentType?.toString())
        assertTrue(assertNotNull(assetContent.body).decodeToString().contains("<svg"))
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
