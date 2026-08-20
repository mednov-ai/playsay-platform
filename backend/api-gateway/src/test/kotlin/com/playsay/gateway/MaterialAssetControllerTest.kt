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

class MaterialAssetControllerTest : MaterialControllerTestFixture() {
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
}
