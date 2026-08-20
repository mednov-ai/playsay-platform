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

class MaterialAiControllerIntegrationTest : MaterialControllerTestFixture() {
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

}
