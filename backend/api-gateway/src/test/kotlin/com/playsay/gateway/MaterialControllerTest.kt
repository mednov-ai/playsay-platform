package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.repo.*
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
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:material-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.storage.provider=memory",
        "playsay.ai.html-game-enrichment.enabled=false",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MaterialControllerTest @Autowired constructor(
    private val materialCrudController: MaterialCrudController,
    private val scheduledMaterialController: ScheduledMaterialController,
    private val materialAiController: MaterialAiController,
    private val materialAssetController: MaterialAssetController,
    private val materialImagePageController: MaterialImagePageController,
    private val courseController: CourseController,
    private val scheduleController: ScheduledLessonController,
    private val userProfileStore: UserProfileStore,
    private val lessonMaterialAnnotationRepo: LessonMaterialAnnotationRepo,
    private val materialAssetRepo: MaterialAssetRepo,
    private val materialHtmlGameEnrichmentRepo: MaterialHtmlGameEnrichmentRepo,
    private val materialHtmlGameEnrichmentService: MaterialHtmlGameEnrichmentService,
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
            this.dataSource = this@MaterialControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        lessonMaterialAnnotationRepo.deleteAllInBatch()
        materialHtmlGameEnrichmentRepo.deleteAllInBatch()
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

    @Test
    fun `teacher appends reusable uploaded image page to material and serves stored content`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Reusable worksheet", status = "PUBLISHED"),
        ).body!!

        val response = materialImagePageController.appendReusableImagePage(
            teacher,
            material.id,
            imageFile(name = "worksheet.png", contentType = "image/png"),
            title = "Worksheet scan",
        ).body!!

        assertEquals(material.id, response.material.id)
        assertEquals(response.activePageId, response.material.document["pages"][1]["id"].asText())
        assertEquals("STATIC_IMAGE", response.material.document["pages"][1]["layout"].asText())
        assertEquals("Worksheet scan", response.material.document["pages"][1]["title"].asText())
        val block = response.material.document["pages"][1]["blocks"][0]
        assertEquals("image", block["type"].asText())
        assertEquals("contain", block["objectFit"].asText())
        assertEquals("FULL", block["imageSize"].asText())
        assertTrue(block["url"].asText().startsWith("material-asset:"))

        val assets = materialAssetController.listAssets(teacher, material.id)
        val asset = assets.single { item -> item.kind == "UPLOADED_IMAGE" }
        assertEquals("USER", asset.provider)
        assertEquals("worksheet.png", asset.metadata["fileName"].asText())
        assertEquals("image/png", asset.metadata["mimeType"].asText())
        assertEquals(asset.id.toString(), block["url"].asText().removePrefix("material-asset:"))

        val content = materialAssetController.assetContent(teacher, material.id, asset.id)
        assertEquals(HttpStatus.OK, content.statusCode)
        assertEquals("image/png", content.headers.contentType?.toString())
        assertTrue(assertNotNull(content.body).isNotEmpty())

        val studentError = assertFailsWith<ResponseStatusException> {
            materialImagePageController.appendReusableImagePage(
                student,
                material.id,
                imageFile(name = "student.png", contentType = "image/png"),
            )
        }
        assertEquals(HttpStatus.FORBIDDEN, studentError.statusCode)
    }

    @Test
    fun `live uploaded image page creates lesson specific material copy and reuses it`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val reusableMaterial = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Reusable live material", status = "PUBLISHED"),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = reusableMaterial.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val firstUpload = materialImagePageController.appendLiveLessonImagePage(
            teacher,
            lesson.id,
            imageFile(name = "live.svg", contentType = "image/svg+xml", bytes = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 4 3\"><rect width=\"4\" height=\"3\"/></svg>".toByteArray()),
            title = "Live scan",
        ).body!!

        assertEquals(lesson.id, firstUpload.lesson.id)
        assertEquals(firstUpload.material.id, firstUpload.lesson.materialId)
        assertTrue(firstUpload.material.id != reusableMaterial.id)
        assertEquals(firstUpload.activePageId, firstUpload.material.document["pages"][1]["id"].asText())
        assertEquals("STATIC_IMAGE", firstUpload.material.document["pages"][1]["layout"].asText())
        assertEquals(1, materialCrudController.get(teacher, reusableMaterial.id).document["pages"].size())
        assertEquals(firstUpload.material.id, scheduleController.get(student, lesson.id).materialId)
        assertEquals(firstUpload.material.id, scheduledMaterialController.scheduledLessonMaterial(student, lesson.id).id)
        assertEquals("LIVE_LESSON_COPY", firstUpload.material.sourceMeta["kind"].asText())
        assertEquals(lesson.id.toString(), firstUpload.material.sourceMeta["sourceLessonId"].asText())
        assertEquals(reusableMaterial.id.toString(), firstUpload.material.sourceMeta["sourceMaterialId"].asText())

        val copiedAsset = materialAssetController.listAssets(student, firstUpload.material.id).single()
        assertEquals("UPLOADED_IMAGE", copiedAsset.kind)
        assertEquals("image/svg+xml", materialAssetController.assetContent(student, firstUpload.material.id, copiedAsset.id).headers.contentType?.toString())
        val activeAnnotation = scheduledMaterialController.scheduledLessonMaterialAnnotation(student, lesson.id)
        assertEquals(firstUpload.activePageId, activeAnnotation.content["activePageId"].asText())

        val secondUpload = materialImagePageController.appendLiveLessonImagePage(
            teacher,
            lesson.id,
            imageFile(name = "second.webp", contentType = "image/webp"),
        ).body!!
        assertEquals(firstUpload.material.id, secondUpload.material.id)
        assertEquals(3, secondUpload.material.document["pages"].size())
        assertEquals(secondUpload.activePageId, secondUpload.material.document["pages"][2]["id"].asText())
    }

    @Test
    fun `live uploaded image page creates lesson only material when lesson has no material`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val uploaded = materialImagePageController.appendLiveLessonImagePage(
            teacher,
            lesson.id,
            imageFile(name = "first.jpg", contentType = "image/jpeg"),
        ).body!!

        assertEquals(uploaded.material.id, uploaded.lesson.materialId)
        assertEquals(uploaded.material.id, scheduleController.get(student, lesson.id).materialId)
        assertEquals("LIVE_LESSON_COPY", uploaded.material.sourceMeta["kind"].asText())
        assertEquals(lesson.id.toString(), uploaded.material.sourceMeta["sourceLessonId"].asText())
        assertFalse(uploaded.material.sourceMeta.has("sourceMaterialId"))
        assertEquals(1, uploaded.material.document["pages"].size())
        assertEquals("STATIC_IMAGE", uploaded.material.document["pages"][0]["layout"].asText())
        assertEquals(uploaded.activePageId, scheduledMaterialController.scheduledLessonMaterialAnnotation(student, lesson.id).content["activePageId"].asText())
    }

    @Test
    fun `live uploaded image page rejects unsupported files oversized files parallel lessons and students`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Shared live material", status = "PUBLISHED"),
        ).body!!
        val sharedLesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val studentError = assertFailsWith<ResponseStatusException> {
            materialImagePageController.appendLiveLessonImagePage(
                studentOne,
                sharedLesson.id,
                imageFile(name = "student.png", contentType = "image/png"),
            )
        }
        assertEquals(HttpStatus.FORBIDDEN, studentError.statusCode)

        val unsupportedError = assertFailsWith<ResponseStatusException> {
            materialImagePageController.appendLiveLessonImagePage(
                teacher,
                sharedLesson.id,
                imageFile(name = "worksheet.gif", contentType = "image/gif"),
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, unsupportedError.statusCode)

        val oversizedError = assertFailsWith<ResponseStatusException> {
            materialImagePageController.appendLiveLessonImagePage(
                teacher,
                sharedLesson.id,
                imageFile(name = "large.jpg", contentType = "image/jpeg", bytes = ByteArray(12 * 1024 * 1024 + 1) { 1 }),
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, oversizedError.statusCode)

        val parallelMaterial = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Parallel live material", status = "PUBLISHED"),
        ).body!!
        val parallelLesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = parallelMaterial.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                type = "GROUP",
                workMode = "PARALLEL",
                participantSubjects = listOf("student-1", "student-2"),
            ),
        ).body!!
        val parallelError = assertFailsWith<ResponseStatusException> {
            materialImagePageController.appendLiveLessonImagePage(
                teacher,
                parallelLesson.id,
                imageFile(name = "parallel.png", contentType = "image/png"),
            )
        }
        assertEquals(HttpStatus.BAD_REQUEST, parallelError.statusCode)
    }

    @Test
    fun `teacher uploads reusable image and html game assets without changing material document`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Reusable game", status = "DRAFT"),
        ).body!!

        val imageResponse = materialAssetController.uploadImageAsset(
            teacher,
            material.id,
            imageFile(name = "picture.webp", contentType = "image/webp"),
        )
        val gameResponse = materialAssetController.uploadHtmlGameAsset(
            teacher,
            material.id,
            htmlFile(name = "memory.html"),
        )

        assertEquals(HttpStatus.CREATED, imageResponse.statusCode)
        assertEquals("UPLOADED_IMAGE", imageResponse.body!!.kind)
        assertEquals(HttpStatus.CREATED, gameResponse.statusCode)
        assertEquals("HTML_GAME", gameResponse.body!!.kind)
        assertEquals("text/html", gameResponse.body!!.metadata["mimeType"].asText())
        assertTrue(gameResponse.body!!.metadata["selfContained"].asBoolean())
        assertEquals("Memory game", gameResponse.body!!.metadata["gameTitle"].asText())
        assertEquals("HTML", gameResponse.body!!.metadata["gameTitleSource"].asText())
        assertEquals(1, materialCrudController.get(teacher, material.id).document["pages"].size())
        val gameContent = materialAssetController.assetContent(teacher, material.id, gameResponse.body!!.id)
        assertEquals("text/html", gameContent.headers.contentType?.toString())
        assertTrue(assertNotNull(gameContent.body).decodeToString().contains("Memory game"))

        val nonEnglishGame = materialAssetController.uploadHtmlGameAsset(
            teacher,
            material.id,
            htmlFile(name = "rhyme.html", content = "<html><head><title>Найди рифму</title></head><body><h1>Найди рифму</h1></body></html>"),
        ).body!!
        assertEquals("New game", nonEnglishGame.metadata["gameTitle"].asText())
        assertTrue(nonEnglishGame.metadata["gameTitleNeedsAi"].asBoolean())

        val studentError = assertFailsWith<ResponseStatusException> {
            materialAssetController.uploadHtmlGameAsset(student, material.id, htmlFile(name = "student.html"))
        }
        assertEquals(HttpStatus.FORBIDDEN, studentError.statusCode)
    }

    @Test
    fun `html game enrichment generates icon and updates linked block`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val created = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Game enrichment", status = "DRAFT"),
        ).body!!
        val gameAsset = materialAssetController.uploadHtmlGameAsset(
            teacher,
            created.id,
            htmlFile(name = "memory.html"),
        ).body!!
        materialCrudController.update(
            teacher,
            created.id,
            LessonMaterialRequest(
                title = created.title,
                status = "DRAFT",
                document = objectMapper.readTree(
                    """
                    {"schemaVersion":1,"pages":[{"id":"page-1","title":"Game","layout":"FLOW","blocks":[{"id":"game-1","type":"htmlGame","title":"Memory game","gameTitleSource":"HTML","url":"material-asset:${gameAsset.id}","height":640}]}]}
                    """.trimIndent(),
                ),
            ),
        )

        val queued = materialAssetController.requestHtmlGameEnrichment(
            teacher,
            created.id,
            gameAsset.id,
            MaterialHtmlGameEnrichmentRequest(blockId = "game-1"),
        )
        assertEquals(HttpStatus.ACCEPTED, queued.statusCode)
        assertEquals("PENDING", queued.body!!.status)

        val jobId = assertNotNull(materialHtmlGameEnrichmentService.claimNext())
        materialHtmlGameEnrichmentService.process(jobId)

        val ready = materialAssetController.htmlGameEnrichmentStatus(teacher, created.id, gameAsset.id, "game-1")
        assertEquals("READY", ready.status)
        assertEquals("Memory game", ready.title)
        assertTrue(ready.gameIconUrl!!.startsWith("material-asset:"))
        val updatedBlock = materialCrudController.get(teacher, created.id).document["pages"][0]["blocks"][0]
        assertEquals(ready.gameIconUrl, updatedBlock["gameIconUrl"].asText())
        assertEquals("HTML", updatedBlock["gameTitleSource"].asText())
        assertEquals(1, materialAssetController.listAssets(teacher, created.id).count { it.kind == "GAME_ICON" })

        val invalidPreferredTitle = assertFailsWith<ProjectResponseException> {
            materialAssetController.requestHtmlGameEnrichment(
                teacher,
                created.id,
                gameAsset.id,
                MaterialHtmlGameEnrichmentRequest(blockId = "game-1", preferredTitle = "Моя игра", regenerateIcon = true),
            )
        }
        assertEquals(MetaData.ErrorCodes.MATERIAL_HTML_GAME_TITLE_NOT_ENGLISH, invalidPreferredTitle.errorCode)

        val invalidManualDocument = materialCrudController.get(teacher, created.id).document.deepCopy<ObjectNode>()
        invalidManualDocument["pages"][0]["blocks"][0].let { node ->
            (node as ObjectNode).put("title", "Моя игра")
            node.put("gameTitleSource", "USER")
        }
        val invalidManualTitle = assertFailsWith<ProjectResponseException> {
            materialCrudController.update(
                teacher,
                created.id,
                LessonMaterialRequest(title = created.title, status = "DRAFT", document = invalidManualDocument),
            )
        }
        assertEquals(MetaData.ErrorCodes.MATERIAL_HTML_GAME_TITLE_NOT_ENGLISH, invalidManualTitle.errorCode)

        val manualDocument = materialCrudController.get(teacher, created.id).document.deepCopy<ObjectNode>()
        manualDocument["pages"][0]["blocks"][0].let { node ->
            (node as ObjectNode).put("title", "My custom race")
            node.put("gameTitleSource", "USER")
        }
        materialCrudController.update(
            teacher,
            created.id,
            LessonMaterialRequest(title = created.title, status = "DRAFT", document = manualDocument),
        )
        materialAssetController.requestHtmlGameEnrichment(
            teacher,
            created.id,
            gameAsset.id,
            MaterialHtmlGameEnrichmentRequest(blockId = "game-1", preferredTitle = "My custom race", regenerateIcon = true),
        )
        materialHtmlGameEnrichmentService.process(assertNotNull(materialHtmlGameEnrichmentService.claimNext()))
        val regeneratedBlock = materialCrudController.get(teacher, created.id).document["pages"][0]["blocks"][0]
        assertEquals("My custom race", regeneratedBlock["title"].asText())
        assertEquals("USER", regeneratedBlock["gameTitleSource"].asText())
        assertEquals(1, materialAssetController.listAssets(teacher, created.id).count { it.kind == "GAME_ICON" })
    }

    @Test
    fun `live html game creates lesson copy becomes active and reuses it for later uploads`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val reusableMaterial = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Reusable lesson", status = "PUBLISHED"),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = reusableMaterial.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val gameUpload = materialImagePageController.appendLiveLessonHtmlGamePage(
            teacher,
            lesson.id,
            htmlFile(name = "race.html"),
        ).body!!

        assertTrue(gameUpload.material.id != reusableMaterial.id)
        assertEquals(gameUpload.material.id, gameUpload.lesson.materialId)
        assertEquals(gameUpload.activePageId, gameUpload.material.document["pages"][1]["id"].asText())
        assertEquals("HTML_GAME", gameUpload.material.document["pages"][1]["layout"].asText())
        val block = gameUpload.material.document["pages"][1]["blocks"][0]
        assertEquals("htmlGame", block["type"].asText())
        assertTrue(block["url"].asText().startsWith("material-asset:"))
        assertEquals(1, materialCrudController.get(teacher, reusableMaterial.id).document["pages"].size())
        assertEquals(gameUpload.activePageId, scheduledMaterialController.scheduledLessonMaterialAnnotation(student, lesson.id).content["activePageId"].asText())
        val gameAsset = materialAssetController.listAssets(student, gameUpload.material.id).single { asset -> asset.kind == "HTML_GAME" }
        assertEquals("text/html", materialAssetController.assetContent(student, gameUpload.material.id, gameAsset.id).headers.contentType?.toString())

        val imageUpload = materialImagePageController.appendLiveLessonImagePage(
            teacher,
            lesson.id,
            imageFile(name = "after-game.png", contentType = "image/png"),
        ).body!!
        assertEquals(gameUpload.material.id, imageUpload.material.id)
        assertEquals(3, imageUpload.material.document["pages"].size())
        assertEquals(imageUpload.activePageId, imageUpload.material.document["pages"][2]["id"].asText())
    }

    @Test
    fun `html game upload validates format encoding sandbox rules size role and lesson mode`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val studentOne = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val studentTwo = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(studentOne)
        userProfileStore.currentUserId(studentTwo)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Game validation", status = "PUBLISHED"),
        ).body!!
        val sharedLesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val unsupported = assertFailsWith<ResponseStatusException> {
            materialAssetController.uploadHtmlGameAsset(
                teacher,
                material.id,
                imageFile(name = "game.txt", contentType = "text/plain", bytes = "<html></html>".toByteArray()),
            )
        }
        val invalidUtf8 = assertFailsWith<ResponseStatusException> {
            materialAssetController.uploadHtmlGameAsset(
                teacher,
                material.id,
                imageFile(name = "game.html", contentType = "text/html", bytes = byteArrayOf(0xC3.toByte(), 0x28)),
            )
        }
        val unsafeFrame = assertFailsWith<ResponseStatusException> {
            materialAssetController.uploadHtmlGameAsset(
                teacher,
                material.id,
                htmlFile(content = "<html><body><iframe srcdoc=\"unsafe\"></iframe></body></html>"),
            )
        }
        val externalScript = assertFailsWith<ResponseStatusException> {
            materialAssetController.uploadHtmlGameAsset(
                teacher,
                material.id,
                htmlFile(content = "<html><head><script src=\"https://example.com/game.js\"></script></head></html>"),
            )
        }
        val relativeScript = assertFailsWith<ResponseStatusException> {
            materialAssetController.uploadHtmlGameAsset(
                teacher,
                material.id,
                htmlFile(content = "<html><head><script src=\"game.js\"></script></head></html>"),
            )
        }
        val oversized = assertFailsWith<ResponseStatusException> {
            materialAssetController.uploadHtmlGameAsset(
                teacher,
                material.id,
                imageFile(name = "large.html", contentType = "text/html", bytes = ByteArray(5 * 1024 * 1024 + 1) { 1 }),
            )
        }
        val studentError = assertFailsWith<ResponseStatusException> {
            materialImagePageController.appendLiveLessonHtmlGamePage(studentOne, sharedLesson.id, htmlFile())
        }

        assertEquals(HttpStatus.BAD_REQUEST, unsupported.statusCode)
        assertEquals(HttpStatus.BAD_REQUEST, invalidUtf8.statusCode)
        assertEquals(HttpStatus.BAD_REQUEST, unsafeFrame.statusCode)
        assertEquals(HttpStatus.BAD_REQUEST, externalScript.statusCode)
        assertEquals(HttpStatus.BAD_REQUEST, relativeScript.statusCode)
        assertEquals(HttpStatus.BAD_REQUEST, oversized.statusCode)
        assertEquals(HttpStatus.FORBIDDEN, studentError.statusCode)

        val parallelMaterial = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Parallel game", status = "PUBLISHED"),
        ).body!!
        val parallelLesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = parallelMaterial.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                type = "GROUP",
                workMode = "PARALLEL",
                participantSubjects = listOf("student-1", "student-2"),
            ),
        ).body!!
        val parallelError = assertFailsWith<ResponseStatusException> {
            materialImagePageController.appendLiveLessonHtmlGamePage(teacher, parallelLesson.id, htmlFile())
        }
        assertEquals(HttpStatus.BAD_REQUEST, parallelError.statusCode)
    }

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

    @Test
    fun `submission scoring applies attempts and hints while ignoring fill gap weights`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Attempt scoring",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Attempts",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Fill gaps",
                              "assessment": {
                                "attemptPenalty": 0.30,
                                "hintPenalty": 0.15,
                                "minimumCorrectFactor": 0.40
                              },
                              "items": [
                                {
                                  "prompt": "It is ___ cat.",
                                  "answer": "a",
                                  "options": ["a", "an", "-"],
                                  "weight": 2
                                },
                                {
                                  "prompt": "It is ___ apple.",
                                  "answer": "an",
                                  "options": ["a", "an", "-"],
                                  "weight": 1
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
                        "gaps": {
                          "type": "fillGaps",
                          "items": {
                            "It is ___ cat.-0": "a",
                            "It is ___ apple.-1": "an"
                          },
                          "attempts": {
                            "It is ___ cat.-0": [
                              { "value": "an", "correct": false },
                              { "value": "a", "correct": true }
                            ],
                            "It is ___ apple.-1": [
                              { "value": "an", "correct": true }
                            ]
                          },
                          "hints": {
                            "It is ___ cat.-0": [
                              { "type": "firstLetter", "penalty": 0.15 }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal("8.50").compareTo(assertNotNull(submission.score)))
        assertEquals(1, submission.errorsCount)
        val assessment = submission.content["assessment"]
        assertEquals(1, assessment["errorsCount"].asInt())
        assertEquals(0, BigDecimal("2").compareTo(assessment["totalWeight"].decimalValue()))
        assertEquals(2, assessment["items"].size())
        val firstItem = assessment["items"][0]
        assertEquals("CORRECT_WITH_HINT", firstItem["status"].asText())
        assertEquals(0, BigDecimal.ONE.compareTo(firstItem["weight"].decimalValue()))
        assertEquals(2, firstItem["attemptsUsed"].asInt())
        assertEquals(1, firstItem["hintsUsed"].asInt())
        assertEquals(0, BigDecimal("0.70").compareTo(firstItem["scoreFactor"].decimalValue()))
    }

    @Test
    fun `submission scoring uses fixed fill gap retry factors instead of configured penalties`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Fixed fill gap scoring",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Attempts",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Fill gaps",
                              "assessment": {
                                "maxAttempts": 1,
                                "attemptPenalty": 1,
                                "hintPenalty": 1
                              },
                              "items": [
                                {
                                  "id": "retry",
                                  "prompt": "I enjoy ___ books.",
                                  "answer": "reading",
                                  "maxAttempts": 5
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
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

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
                        "gaps": {
                          "type": "fillGaps",
                          "items": {
                            "retry": "reading"
                          },
                          "attempts": {
                            "retry": [
                              { "value": "read", "correct": false },
                              { "value": "reading", "correct": true }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal("7.00").compareTo(assertNotNull(submission.score)))
        val itemAssessment = submission.content["assessment"]["items"][0]
        assertEquals("CORRECT_AFTER_RETRY", itemAssessment["status"].asText())
        assertEquals(5, itemAssessment["maxAttempts"].asInt())
        assertEquals(0, BigDecimal("0.70").compareTo(itemAssessment["scoreFactor"].decimalValue()))
    }

    @Test
    fun `submission scoring applies matching pair max error limits`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Matching attempts",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Matching",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "matching",
                              "type": "matchingPairs",
                              "title": "Match",
                              "pairs": [
                                {
                                  "id": "pair-a",
                                  "left": "elusive",
                                  "right": "difficult to find"
                                },
                                {
                                  "id": "pair-b",
                                  "left": "goal",
                                  "right": "aim"
                                }
                              ],
                              "assessment": {
                                "maxErrors": 2
                              }
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
                        "matching": {
                          "type": "matchingPairs",
                          "matches": {},
                          "attempts": {
                            "pair-a": [
                              { "value": "pair-b", "correct": false }
                            ],
                            "pair-b": [
                              { "value": "pair-a", "correct": false }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal.ZERO.compareTo(assertNotNull(submission.score)))
        val firstItem = submission.content["assessment"]["items"][0]
        assertEquals("LOCKED", firstItem["status"].asText())
        assertEquals(1, firstItem["attemptsUsed"].asInt())
        assertEquals(1, firstItem["incorrectAttempts"].asInt())
        val secondItem = submission.content["assessment"]["items"][1]
        assertEquals("LOCKED", secondItem["status"].asText())
        assertEquals(1, secondItem["attemptsUsed"].asInt())
        assertEquals(1, secondItem["incorrectAttempts"].asInt())
    }

    @Test
    fun `submission scoring accepts stable item ids and additional accepted answers`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Accepted variants",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Verb forms",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Complete the sentences",
                              "items": [
                                {
                                  "id": "item-go-cinema",
                                  "prompt": "I don't enjoy ___ to the cinema on my own.",
                                  "answer": "going",
                                  "acceptedAnswers": ["going out", "going alone"]
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
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

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
                        "gaps": {
                          "type": "fillGaps",
                          "items": {
                            "item-go-cinema": "going out"
                          },
                          "attempts": {
                            "item-go-cinema": [
                              { "value": "going out", "correct": true }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal.TEN.compareTo(assertNotNull(submission.score)))
        assertEquals(0, submission.errorsCount)
        val itemAssessment = submission.content["assessment"]["items"][0]
        assertEquals("item-go-cinema", itemAssessment["itemKey"].asText())
        assertEquals("CORRECT", itemAssessment["status"].asText())
    }

    @Test
    fun `submission scoring keeps duplicate word bank options distinct by option id`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Word bank duplicates",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Prepositions",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Complete the sentences",
                              "wordBankOptions": [
                                { "id": "bank-to-1", "value": "to" },
                                { "id": "bank-to-2", "value": "to" }
                              ],
                              "items": [
                                {
                                  "id": "item-arrive",
                                  "prompt": "I am going ___ the airport.",
                                  "answer": "to",
                                  "answerOptionId": "bank-to-2",
                                  "gapMode": "wordBank"
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
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

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
                        "gaps": {
                          "type": "fillGaps",
                          "items": {
                            "item-arrive": "to"
                          },
                          "optionIds": {
                            "item-arrive": "bank-to-1"
                          },
                          "attempts": {
                            "item-arrive": [
                              { "value": "to", "correct": false, "optionId": "bank-to-1" }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal.ZERO.compareTo(assertNotNull(submission.score)))
        assertEquals(1, submission.errorsCount)
        val itemAssessment = submission.content["assessment"]["items"][0]
        assertEquals("INCORRECT", itemAssessment["status"].asText())
        assertEquals(1, itemAssessment["incorrectAttempts"].asInt())
    }

    @Test
    fun `teacher requests AI accepted answer suggestions for selected material items`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "AI accepted variants",
                status = "DRAFT",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Travel",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Correct the mistakes",
                              "items": [
                                {
                                  "id": "item-about",
                                  "prompt": "She said she's thinking ___ a bit.",
                                  "answer": "about it",
                                  "acceptedAnswers": ["about that"]
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

        val response = materialAiController.suggestAcceptedAnswers(
            teacher,
            material.id,
            MaterialAnswerSuggestionsRequest(blockId = "gaps", itemIds = listOf("item-about")),
        )

        assertEquals(material.id, response.materialId)
        assertEquals("gaps", response.blockId)
        assertEquals(1, response.items.size)
        assertEquals("item-about", response.items.single().itemId)
        assertTrue(response.items.single().suggestions.isNotEmpty())
        assertTrue(response.items.single().suggestions.none { suggestion -> suggestion.value == "about it" })
        assertTrue(response.items.single().suggestions.none { suggestion -> suggestion.value == "about that" })

        val error = assertFailsWith<ResponseStatusException> {
            materialAiController.suggestAcceptedAnswers(
                student,
                material.id,
                MaterialAnswerSuggestionsRequest(blockId = "gaps", itemIds = listOf("item-about")),
            )
        }
        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

    @Test
    fun `non participant cannot read scheduled lesson material`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val otherStudent = authentication(subject = "student-2", username = "student.two", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        userProfileStore.currentUserId(otherStudent)
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Private")).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val error = assertFailsWith<ResponseStatusException> {
            scheduledMaterialController.scheduledLessonMaterial(otherStudent, lesson.id)
        }

        assertEquals(HttpStatus.NOT_FOUND, error.statusCode)
    }

    @Test
    fun `teacher cannot attach another teacher private material`() {
        val owner = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val otherTeacher = authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER")
        val privateMaterial = materialCrudController.create(
            owner,
            LessonMaterialRequest(title = "Owner only", status = "PUBLISHED"),
        ).body!!
        val privateScheduleMaterial = materialCrudController.create(
            owner,
            LessonMaterialRequest(title = "Owner only schedule", status = "PUBLISHED"),
        ).body!!
        val course = courseController.create(otherTeacher, CourseRequest(title = "Other course", isPublished = true)).body!!

        val courseError = assertFailsWith<ResponseStatusException> {
            courseController.createLesson(
                otherTeacher,
                course.id,
                CourseLessonRequest(title = "Other lesson", materialId = privateMaterial.id),
            )
        }
        val scheduleError = assertFailsWith<ResponseStatusException> {
            scheduleController.create(
                otherTeacher,
                ScheduledLessonRequest(
                    materialId = privateScheduleMaterial.id,
                    scheduledStart = activeLessonStart(),
                    scheduledEnd = activeLessonEnd(),
                ),
            )
        }

        assertEquals(HttpStatus.BAD_REQUEST, courseError.statusCode)
        assertEquals(HttpStatus.BAD_REQUEST, scheduleError.statusCode)

        val publicMaterial = materialCrudController.update(
            owner,
            privateMaterial.id,
            LessonMaterialRequest(
                title = privateMaterial.title,
                description = privateMaterial.description,
                language = privateMaterial.language,
                cefrLevel = privateMaterial.cefrLevel,
                visibility = "PUBLIC",
                status = "PUBLISHED",
                document = privateMaterial.document,
                sourceMeta = privateMaterial.sourceMeta,
                scoringRubric = privateMaterial.scoringRubric,
            ),
        )
        val linkedLesson = courseController.createLesson(
            otherTeacher,
            course.id,
            CourseLessonRequest(title = "Public lesson", materialId = publicMaterial.id),
        ).body!!

        assertEquals(publicMaterial.id, linkedLesson.materialId)
    }

    @Test
    fun `AI draft stub returns editable PlaySay material document`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")

        val draft = materialAiController.draft(
            teacher,
            MaterialAiDraftRequest(
                prompt = "B1 travel speaking lesson with useful vocabulary",
                title = "Travel talk",
            ),
        )

        assertEquals("Travel talk", draft.title)
        assertEquals("B1", draft.cefrLevel)
        assertEquals("DRAFT", draft.status)
        assertEquals(1, draft.document["schemaVersion"].asInt())
        assertEquals(6, draft.document["pages"][0]["blocks"].size())
        assertEquals(10, draft.scoringRubric["maxScore"].asInt())
    }

    @Test
    fun `AI draft accepts worksheet image metadata and rejects invalid image data URLs`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")

        val draft = materialAiController.draft(
            teacher,
            MaterialAiDraftRequest(
                prompt = "A1 articles worksheet from scan",
                title = "Articles",
                sourceImageDataUrl = "data:image/png;base64,iVBORw0KGgo=",
                sourceFileName = "articles.png",
            ),
        )

        assertEquals("scan", draft.sourceMeta["sourceType"].asText())
        assertEquals("articles.png", draft.sourceMeta["sourceFileName"].asText())

        val error = assertFailsWith<ResponseStatusException> {
            materialAiController.draft(
                teacher,
                MaterialAiDraftRequest(
                    prompt = "A1 articles worksheet from scan",
                    sourceImageDataUrl = "data:text/plain;base64,SGVsbG8=",
                ),
            )
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    @Test
    fun `teacher generates missing matching pair images and preserves row order`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Birds",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Birds",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "block-hero",
                              "type": "generatedImage",
                              "title": "Bird classroom picture",
                              "prompt": "child-friendly workbook bird classroom picture, white background",
                              "caption": "Birds"
                            },
                            {
                              "id": "block-birds",
                              "type": "matchingPairs",
                              "title": "Birds matching",
                              "pairs": [
                                {
                                  "id": "pair-owl",
                                  "left": "owl",
                                  "right": "owl",
                                  "targetKind": "IMAGE",
                                  "imagePrompt": "child-friendly workbook owl illustration",
                                  "imageAlt": "owl"
                                },
                                {
                                  "id": "pair-duck",
                                  "left": "duck",
                                  "right": "duck",
                                  "targetKind": "IMAGE",
                                  "imagePrompt": "child-friendly workbook duck illustration",
                                  "imageAlt": "duck"
                                },
                                {
                                  "id": "pair-word",
                                  "left": "hello",
                                  "right": "привет",
                                  "targetKind": "TEXT"
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

        val generated = materialAiController.generateImages(
            teacher,
            material.id,
            MaterialGenerateImagesRequest(maxImages = 12),
        )

        val generatedImageBlock = generated.document["pages"][0]["blocks"][0]
        assertTrue(generatedImageBlock["url"].asText().startsWith("material-asset:"))
        val pairs = generated.document["pages"][0]["blocks"][1]["pairs"]
        assertEquals("owl", pairs[0]["left"].asText())
        assertEquals("duck", pairs[1]["left"].asText())
        assertTrue(pairs[0]["imageUrl"].asText().startsWith("material-asset:"))
        assertTrue(pairs[1]["imageUrl"].asText().startsWith("material-asset:"))
        assertEquals("TEXT", pairs[2]["targetKind"].asText())
        assertFalse(pairs[2].has("imageUrl"))
        val assets = materialAssetController.listAssets(teacher, material.id)
        assertEquals(3, assets.size)
        assertEquals("GENERATED_IMAGE", assets[0].kind)
        assertTrue(assets.all { asset -> asset.externalUrl == null })
        assertTrue(assets.all { asset -> asset.storageKey?.startsWith("material-assets/${material.id}/") == true })
        assertTrue(assets.all { asset -> asset.contentUrl?.startsWith("/api/materials/${material.id}/assets/") == true })
        assertTrue(assets.all { asset -> asset.metadata["tags"].isArray && asset.metadata["tags"].size() > 0 })
        assertTrue(assets.all { asset -> asset.metadata["sourcePrompt"].asText().isNotBlank() })
        val owlAsset = assets.single { asset -> asset.metadata["targetId"].asText() == "pair-owl" }
        assertTrue(owlAsset.metadata["tags"].isArray)
        assertTrue(owlAsset.metadata["tags"].any { tag -> tag.asText() == "owl" })
        assertTrue(assets.map { asset -> "material-asset:${asset.id}" }.contains(pairs[0]["imageUrl"].asText()))
        assertTrue(assets.map { asset -> "material-asset:${asset.id}" }.contains(generatedImageBlock["url"].asText()))

        val regenerated = materialAiController.generateImages(
            teacher,
            material.id,
            MaterialGenerateImagesRequest(maxImages = 12, regenerate = true),
        )
        val regeneratedPairs = regenerated.document["pages"][0]["blocks"][1]["pairs"]
        val regeneratedAssets = materialAssetController.listAssets(teacher, material.id)
        assertEquals(assets.map { asset -> asset.id }.toSet(), regeneratedAssets.map { asset -> asset.id }.toSet())
        assertEquals(pairs[0]["imageUrl"].asText(), regeneratedPairs[0]["imageUrl"].asText())
        assertEquals(generatedImageBlock["url"].asText(), regenerated.document["pages"][0]["blocks"][0]["url"].asText())

        val updatedAsset = materialAssetController.updateAsset(
            teacher,
            material.id,
            owlAsset.id,
            MaterialAssetUpdateRequest(tags = listOf("Bird", "custom tag", "a", "custom tag")),
        )
        assertEquals(listOf("bird", "custom-tag"), updatedAsset.metadata["tags"].map { tag -> tag.asText() })

        val altEditedDocument = regenerated.document.deepCopy<ObjectNode>()
        (altEditedDocument["pages"][0]["blocks"][1]["pairs"][0] as ObjectNode)
            .put("imageAlt", "teacher-facing label only")
        materialCrudController.update(
            teacher,
            material.id,
            LessonMaterialRequest(
                title = "Birds",
                document = altEditedDocument,
            ),
        )

        val altOnlyGenerated = materialAiController.generateImages(
            teacher,
            material.id,
            MaterialGenerateImagesRequest(maxImages = 12),
        )
        val altOnlyPairs = altOnlyGenerated.document["pages"][0]["blocks"][1]["pairs"]
        val altOnlyAssets = materialAssetController.listAssets(teacher, material.id)
        val altOnlyOwlAsset = altOnlyAssets.single { asset -> asset.metadata["targetId"].asText() == "pair-owl" }
        assertEquals(regeneratedAssets.map { asset -> asset.id }.toSet(), altOnlyAssets.map { asset -> asset.id }.toSet())
        assertEquals(regeneratedPairs[0]["imageUrl"].asText(), altOnlyPairs[0]["imageUrl"].asText())
        assertEquals("child-friendly workbook owl illustration", altOnlyOwlAsset.metadata["sourcePrompt"].asText())
        assertTrue(altOnlyOwlAsset.metadata["tags"].any { tag -> tag.asText() == "custom-tag" })

        val editedDocument = altOnlyGenerated.document.deepCopy<ObjectNode>()
        (editedDocument["pages"][0]["blocks"][1]["pairs"][0] as ObjectNode)
            .put("imagePrompt", "child-friendly workbook snowy owl illustration")
        materialCrudController.update(
            teacher,
            material.id,
            LessonMaterialRequest(
                title = "Birds",
                document = editedDocument,
            ),
        )

        val promptChanged = materialAiController.generateImages(
            teacher,
            material.id,
            MaterialGenerateImagesRequest(maxImages = 12),
        )
        val promptChangedPairs = promptChanged.document["pages"][0]["blocks"][1]["pairs"]
        val promptChangedAssets = materialAssetController.listAssets(teacher, material.id)
        val promptChangedOwlAsset = promptChangedAssets.single { asset -> asset.metadata["targetId"].asText() == "pair-owl" }
        assertEquals(regeneratedAssets.map { asset -> asset.id }.toSet(), promptChangedAssets.map { asset -> asset.id }.toSet())
        assertEquals(pairs[0]["imageUrl"].asText(), promptChangedPairs[0]["imageUrl"].asText())
        assertEquals("child-friendly workbook snowy owl illustration", promptChangedOwlAsset.metadata["sourcePrompt"].asText())
        assertTrue(promptChangedOwlAsset.metadata["tags"].any { tag -> tag.asText() == "custom-tag" })
        assertTrue(promptChangedOwlAsset.metadata["tags"].any { tag -> tag.asText() == "snowy" })
    }

    private fun imageFile(
        name: String,
        contentType: String,
        bytes: ByteArray = byteArrayOf(1, 2, 3, 4),
    ): MockMultipartFile =
        MockMultipartFile("file", name, contentType, bytes)

    private fun htmlFile(
        name: String = "game.html",
        content: String = "<html><head><title>Memory game</title></head><body><button id=\"start\">Start</button><script>document.querySelector('#start').addEventListener('click', () => document.body.dataset.started = 'true')</script></body></html>",
    ): MockMultipartFile =
        MockMultipartFile("file", name, "text/html", content.toByteArray(Charsets.UTF_8))

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
