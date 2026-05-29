package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.repo.*
import com.playsay.gateway.service.*
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
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
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MaterialControllerTest @Autowired constructor(
    private val materialController: MaterialController,
    private val courseController: CourseController,
    private val scheduleController: ScheduledLessonController,
    private val userProfileStore: UserProfileStore,
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
    fun `teacher creates private material and can publish it publicly`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")

        val created = materialController.create(
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
        assertEquals(HttpStatus.CREATED, materialController.create(teacher, LessonMaterialRequest(title = "Second")).statusCode)
        assertEquals("Food and travel", created.title)
        assertEquals("B1", created.cefrLevel)
        assertEquals("PRIVATE", created.visibility)
        assertEquals(1, created.blockCount)
        assertEquals(emptyList(), materialController.list(student))

        val published = materialController.update(
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
        assertEquals(listOf(created.id), materialController.list(student).map { material -> material.id })
        assertEquals(created.id, materialController.get(student, created.id).id)
    }

    @Test
    fun `material list respects admin teacher student visibility and archive status`() {
        val owner = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val otherTeacher = authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER")
        val admin = authentication(subject = "admin-1", username = "admin.one", role = "ROLE_ADMIN")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val ownerPrivate = materialController.create(
            owner,
            LessonMaterialRequest(title = "Owner private", status = "PUBLISHED"),
        ).body!!
        val ownerDraft = materialController.create(
            owner,
            LessonMaterialRequest(title = "Owner draft", status = "DRAFT"),
        ).body!!
        val publicMaterial = materialController.create(
            owner,
            LessonMaterialRequest(title = "Public material", visibility = "PUBLIC", status = "PUBLISHED"),
        ).body!!
        val archived = materialController.create(
            owner,
            LessonMaterialRequest(title = "Archived material", visibility = "PUBLIC", status = "PUBLISHED"),
        ).body!!
        val otherPrivate = materialController.create(
            otherTeacher,
            LessonMaterialRequest(title = "Other private", status = "PUBLISHED"),
        ).body!!

        materialController.archive(owner, archived.id)

        assertEquals(
            setOf(ownerPrivate.id, ownerDraft.id, publicMaterial.id, otherPrivate.id),
            materialController.list(admin).map { material -> material.id }.toSet(),
        )
        assertEquals(
            setOf(ownerPrivate.id, ownerDraft.id, publicMaterial.id),
            materialController.list(owner).map { material -> material.id }.toSet(),
        )
        assertEquals(listOf(publicMaterial.id), materialController.list(student).map { material -> material.id })
        val studentPrivateError = assertFailsWith<ResponseStatusException> {
            materialController.get(student, ownerPrivate.id)
        }
        assertEquals(HttpStatus.NOT_FOUND, studentPrivateError.statusCode)
    }

    @Test
    fun `student sees private material through assigned scheduled lesson`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialController.create(
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
        val generatedMaterial = materialController.generateImages(
            teacher,
            material.id,
            MaterialGenerateImagesRequest(maxImages = 1),
        )
        val asset = materialController.listAssets(teacher, material.id).single()
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
                scheduledStart = Instant.now().plusSeconds(3600),
                scheduledEnd = Instant.now().plusSeconds(7200),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val scheduledMaterial = materialController.scheduledLessonMaterial(student, lesson.id)

        assertEquals(material.id, scheduledMaterial.id)
        assertEquals("Private classroom material", scheduledMaterial.title)
        assertEquals(listOf(asset.id), materialController.listAssets(student, material.id).map { item -> item.id })
        val assetContent = materialController.assetContent(student, material.id, asset.id)
        assertEquals(HttpStatus.OK, assetContent.statusCode)
        assertEquals("image/svg+xml", assetContent.headers.contentType?.toString())
        assertTrue(assertNotNull(assetContent.body).decodeToString().contains("<svg"))
        val submission = materialController.saveScheduledLessonMaterialSubmission(
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
        assertEquals(submission.id, materialController.scheduledLessonMaterialSubmission(student, lesson.id).id)
        val teacherSubmissions = materialController.scheduledLessonMaterialSubmissions(teacher, lesson.id)
        assertEquals(1, teacherSubmissions.size)
        assertEquals(submission.id, teacherSubmissions.single().id)
        assertEquals("student-1", teacherSubmissions.single().userSubject)
        assertEquals(0, BigDecimal.TEN.compareTo(assertNotNull(teacherSubmissions.single().score)))
        assertEquals("an", teacherSubmissions.single().content["answers"]["warmup"]["items"]["It is ... apple.-0"].asText())
        val studentMonitorError = assertFailsWith<ResponseStatusException> {
            materialController.scheduledLessonMaterialSubmissions(student, lesson.id)
        }
        assertEquals(HttpStatus.FORBIDDEN, studentMonitorError.statusCode)
        val annotation = materialController.saveScheduledLessonMaterialAnnotation(
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
        val teacherAnnotation = materialController.scheduledLessonMaterialAnnotation(teacher, lesson.id)
        assertEquals(annotation.id, teacherAnnotation.id)
        assertEquals(20, teacherAnnotation.content["strokes"][0]["points"][1]["x"].asInt())
        val directReadError = assertFailsWith<ResponseStatusException> {
            materialController.get(student, material.id)
        }
        assertEquals(HttpStatus.NOT_FOUND, directReadError.statusCode)
    }

    @Test
    fun `first classroom material state returns empty submission and annotation`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialController.create(
            teacher,
            LessonMaterialRequest(title = "First classroom state", status = "PUBLISHED"),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = Instant.now().plusSeconds(3600),
                scheduledEnd = Instant.now().plusSeconds(7200),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val submission = materialController.scheduledLessonMaterialSubmission(student, lesson.id)
        val annotation = materialController.scheduledLessonMaterialAnnotation(student, lesson.id)

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
    fun `submission scoring applies weights attempts and hints`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialController.create(
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
                scheduledStart = Instant.now().plusSeconds(3600),
                scheduledEnd = Instant.now().plusSeconds(7200),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val submission = materialController.saveScheduledLessonMaterialSubmission(
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

        assertEquals(0, BigDecimal("8.00").compareTo(assertNotNull(submission.score)))
        assertEquals(1, submission.errorsCount)
        val assessment = submission.content["assessment"]
        assertEquals(1, assessment["errorsCount"].asInt())
        assertEquals(2, assessment["items"].size())
        val firstItem = assessment["items"][0]
        assertEquals("CORRECT_WITH_HINT", firstItem["status"].asText())
        assertEquals(2, firstItem["attemptsUsed"].asInt())
        assertEquals(1, firstItem["hintsUsed"].asInt())
        assertEquals(0, BigDecimal("0.70").compareTo(firstItem["scoreFactor"].decimalValue()))
    }

    @Test
    fun `submission scoring accepts stable item ids and additional accepted answers`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialController.create(
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
                scheduledStart = Instant.now().plusSeconds(3600),
                scheduledEnd = Instant.now().plusSeconds(7200),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val submission = materialController.saveScheduledLessonMaterialSubmission(
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
    fun `teacher requests AI accepted answer suggestions for selected material items`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        val material = materialController.create(
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

        val response = materialController.suggestAcceptedAnswers(
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
            materialController.suggestAcceptedAnswers(
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
        val material = materialController.create(teacher, LessonMaterialRequest(title = "Private")).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = Instant.now().plusSeconds(3600),
                scheduledEnd = Instant.now().plusSeconds(7200),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val error = assertFailsWith<ResponseStatusException> {
            materialController.scheduledLessonMaterial(otherStudent, lesson.id)
        }

        assertEquals(HttpStatus.NOT_FOUND, error.statusCode)
    }

    @Test
    fun `teacher cannot attach another teacher private material`() {
        val owner = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val otherTeacher = authentication(subject = "teacher-2", username = "teacher.two", role = "ROLE_TEACHER")
        val privateMaterial = materialController.create(
            owner,
            LessonMaterialRequest(title = "Owner only", status = "PUBLISHED"),
        ).body!!
        val privateScheduleMaterial = materialController.create(
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
                    scheduledStart = Instant.now().plusSeconds(3600),
                    scheduledEnd = Instant.now().plusSeconds(7200),
                ),
            )
        }

        assertEquals(HttpStatus.BAD_REQUEST, courseError.statusCode)
        assertEquals(HttpStatus.BAD_REQUEST, scheduleError.statusCode)

        val publicMaterial = materialController.update(
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

        val draft = materialController.draft(
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

        val draft = materialController.draft(
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
            materialController.draft(
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
        val material = materialController.create(
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

        val generated = materialController.generateImages(
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
        val assets = materialController.listAssets(teacher, material.id)
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

        val regenerated = materialController.generateImages(
            teacher,
            material.id,
            MaterialGenerateImagesRequest(maxImages = 12, regenerate = true),
        )
        val regeneratedPairs = regenerated.document["pages"][0]["blocks"][1]["pairs"]
        val regeneratedAssets = materialController.listAssets(teacher, material.id)
        assertEquals(assets.map { asset -> asset.id }.toSet(), regeneratedAssets.map { asset -> asset.id }.toSet())
        assertEquals(pairs[0]["imageUrl"].asText(), regeneratedPairs[0]["imageUrl"].asText())
        assertEquals(generatedImageBlock["url"].asText(), regenerated.document["pages"][0]["blocks"][0]["url"].asText())

        val updatedAsset = materialController.updateAsset(
            teacher,
            material.id,
            owlAsset.id,
            MaterialAssetUpdateRequest(tags = listOf("Bird", "custom tag", "a", "custom tag")),
        )
        assertEquals(listOf("bird", "custom-tag"), updatedAsset.metadata["tags"].map { tag -> tag.asText() })

        val altEditedDocument = regenerated.document.deepCopy<ObjectNode>()
        (altEditedDocument["pages"][0]["blocks"][1]["pairs"][0] as ObjectNode)
            .put("imageAlt", "teacher-facing label only")
        materialController.update(
            teacher,
            material.id,
            LessonMaterialRequest(
                title = "Birds",
                document = altEditedDocument,
            ),
        )

        val altOnlyGenerated = materialController.generateImages(
            teacher,
            material.id,
            MaterialGenerateImagesRequest(maxImages = 12),
        )
        val altOnlyPairs = altOnlyGenerated.document["pages"][0]["blocks"][1]["pairs"]
        val altOnlyAssets = materialController.listAssets(teacher, material.id)
        val altOnlyOwlAsset = altOnlyAssets.single { asset -> asset.metadata["targetId"].asText() == "pair-owl" }
        assertEquals(regeneratedAssets.map { asset -> asset.id }.toSet(), altOnlyAssets.map { asset -> asset.id }.toSet())
        assertEquals(regeneratedPairs[0]["imageUrl"].asText(), altOnlyPairs[0]["imageUrl"].asText())
        assertEquals("child-friendly workbook owl illustration", altOnlyOwlAsset.metadata["sourcePrompt"].asText())
        assertTrue(altOnlyOwlAsset.metadata["tags"].any { tag -> tag.asText() == "custom-tag" })

        val editedDocument = altOnlyGenerated.document.deepCopy<ObjectNode>()
        (editedDocument["pages"][0]["blocks"][1]["pairs"][0] as ObjectNode)
            .put("imagePrompt", "child-friendly workbook snowy owl illustration")
        materialController.update(
            teacher,
            material.id,
            LessonMaterialRequest(
                title = "Birds",
                document = editedDocument,
            ),
        )

        val promptChanged = materialController.generateImages(
            teacher,
            material.id,
            MaterialGenerateImagesRequest(maxImages = 12),
        )
        val promptChangedPairs = promptChanged.document["pages"][0]["blocks"][1]["pairs"]
        val promptChangedAssets = materialController.listAssets(teacher, material.id)
        val promptChangedOwlAsset = promptChangedAssets.single { asset -> asset.metadata["targetId"].asText() == "pair-owl" }
        assertEquals(regeneratedAssets.map { asset -> asset.id }.toSet(), promptChangedAssets.map { asset -> asset.id }.toSet())
        assertEquals(pairs[0]["imageUrl"].asText(), promptChangedPairs[0]["imageUrl"].asText())
        assertEquals("child-friendly workbook snowy owl illustration", promptChangedOwlAsset.metadata["sourcePrompt"].asText())
        assertTrue(promptChangedOwlAsset.metadata["tags"].any { tag -> tag.asText() == "custom-tag" })
        assertTrue(promptChangedOwlAsset.metadata["tags"].any { tag -> tag.asText() == "snowy" })
    }

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
