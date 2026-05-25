package com.playsay.gateway

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.time.Instant
import java.util.UUID
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
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
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
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MaterialControllerTest @Autowired constructor(
    private val materialController: MaterialController,
    private val courseController: CourseController,
    private val scheduleController: ScheduledLessonController,
    private val userProfileStore: UserProfileStore,
    private val jdbcClient: JdbcClient,
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
        jdbcClient.sql("DELETE FROM lesson_material_annotation").update()
        jdbcClient.sql("DELETE FROM material_asset").update()
        jdbcClient.sql("DELETE FROM submission").update()
        jdbcClient.sql("DELETE FROM assignment").update()
        jdbcClient.sql("DELETE FROM lesson_participant").update()
        jdbcClient.sql("DELETE FROM lesson").update()
        jdbcClient.sql("DELETE FROM lesson_template").update()
        jdbcClient.sql("DELETE FROM course").update()
        jdbcClient.sql("DELETE FROM lesson_material").update()
        jdbcClient.sql("DELETE FROM app_user").update()
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
    fun `student sees private material through assigned scheduled lesson`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialController.create(
            teacher,
            LessonMaterialRequest(title = "Private classroom material", status = "PUBLISHED"),
        ).body!!
        val asset = materialController.createAsset(
            teacher,
            material.id,
            MaterialAssetRequest(
                kind = "GENERATED_IMAGE",
                externalUrl = "data:image/svg+xml;base64,PHN2Zy8+",
                provider = "AI",
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

        val scheduledMaterial = materialController.scheduledLessonMaterial(student, lesson.id)

        assertEquals(material.id, scheduledMaterial.id)
        assertEquals("Private classroom material", scheduledMaterial.title)
        assertEquals(listOf(asset.id), materialController.listAssets(student, material.id).map { item -> item.id })
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
                            "gap-1": "an"
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
        assertEquals("an", submission.content["answers"]["warmup"]["items"]["gap-1"].asText())
        assertEquals(submission.id, materialController.scheduledLessonMaterialSubmission(student, lesson.id).id)
        val teacherSubmissions = materialController.scheduledLessonMaterialSubmissions(teacher, lesson.id)
        assertEquals(1, teacherSubmissions.size)
        assertEquals(submission.id, teacherSubmissions.single().id)
        assertEquals("student-1", teacherSubmissions.single().userSubject)
        assertEquals("an", teacherSubmissions.single().content["answers"]["warmup"]["items"]["gap-1"].asText())
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
                              "id": "block-birds",
                              "type": "matchingPairs",
                              "title": "Birds matching",
                              "pairs": [
                                {
                                  "id": "pair-owl",
                                  "left": "owl",
                                  "right": "owl",
                                  "imagePrompt": "child-friendly workbook owl illustration",
                                  "imageAlt": "owl"
                                },
                                {
                                  "id": "pair-duck",
                                  "left": "duck",
                                  "right": "duck",
                                  "imagePrompt": "child-friendly workbook duck illustration",
                                  "imageAlt": "duck"
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

        val pairs = generated.document["pages"][0]["blocks"][0]["pairs"]
        assertEquals("owl", pairs[0]["left"].asText())
        assertEquals("duck", pairs[1]["left"].asText())
        assertTrue(pairs[0]["imageUrl"].asText().startsWith("material-asset:"))
        assertTrue(pairs[1]["imageUrl"].asText().startsWith("material-asset:"))
        val assets = materialController.listAssets(teacher, material.id)
        assertEquals(2, assets.size)
        assertEquals("GENERATED_IMAGE", assets[0].kind)
        assertTrue(assets.all { asset -> asset.externalUrl?.startsWith("data:image/svg+xml;base64,") == true })
        assertTrue(assets.map { asset -> "material-asset:${asset.id}" }.contains(pairs[0]["imageUrl"].asText()))
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
