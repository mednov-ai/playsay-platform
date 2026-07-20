package com.playsay.gateway.service

import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.error.ProjectResponseException
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.utils.MetaData
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.springframework.context.support.StaticMessageSource

class MaterialRequestValidatorTest {
    private val validator = MaterialRequestValidator(MessageProvider(StaticMessageSource()))

    @Test
    fun `validate material request normalizes scalars and creates default json`() {
        val result = validator.validate(
            LessonMaterialRequest(
                title = "  Pets  ",
                description = "  Describe animals  ",
                language = " en ",
                cefrLevel = "b1",
                visibility = "public",
                status = "published",
            ),
        )

        assertEquals("Pets", result.title)
        assertEquals("Describe animals", result.description)
        assertEquals("en", result.language)
        assertEquals("B1", result.cefrLevel)
        assertEquals("PUBLIC", result.visibility)
        assertEquals("PUBLISHED", result.status)
        assertEquals(1, result.document["schemaVersion"].asInt())
        assertEquals("MANUAL", result.sourceMeta["kind"].asText())
        assertEquals(10, result.scoringRubric["maxScore"].asInt())
    }

    @Test
    fun `validate material request rejects unsupported enums`() {
        assertFailsWith<ProjectResponseException> {
            validator.validate(LessonMaterialRequest(title = "Pets", cefrLevel = "Z9"))
        }
        assertFailsWith<ProjectResponseException> {
            validator.validate(LessonMaterialRequest(title = "Pets", visibility = "GROUP"))
        }
        assertFailsWith<ProjectResponseException> {
            validator.validate(LessonMaterialRequest(title = "Pets", status = "READY"))
        }
    }

    @Test
    fun `external activity urls are validated and server classified on save`() {
        val document = jacksonObjectMapper().readTree(
            """{"schemaVersion":1,"pages":[{"id":"p1","title":"Page","layout":"FLOW","blocks":[{"id":"e1","type":"externalActivity","title":"Game","url":"https://WORDWALL.NET/resource/1#google_vignette","provider":"FAKE"}]}]}""",
        )

        val result = validator.validate(LessonMaterialRequest(title = "External", document = document))
        val block = result.document.path("pages").path(0).path("blocks").path(0)
        assertEquals("https://wordwall.net/resource/1", block.path("url").asText())
        assertEquals("WORDWALL", block.path("provider").asText())
        assertEquals("GUARANTEED", block.path("externalActivitySupportLevel").asText())

        val unsafe = document.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
        (unsafe.path("pages").path(0).path("blocks").path(0) as com.fasterxml.jackson.databind.node.ObjectNode).put("url", "https://127.0.0.1/internal")
        val error = assertFailsWith<ProjectResponseException> {
            validator.validate(LessonMaterialRequest(title = "Unsafe", document = unsafe))
        }
        assertEquals(MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_HOST_BLOCKED, error.errorCode)
    }

    @Test
    fun `image data url validator accepts supported base64 image payloads`() {
        val encoded = Base64.getEncoder().encodeToString("image".toByteArray())

        assertEquals("data:image/png;base64,$encoded", validator.validatedImageDataUrl("data:image/png;base64,$encoded", "sourceImageDataUrl"))
    }

    @Test
    fun `cefr inference keeps existing marker behavior`() {
        assertEquals("C1", validator.inferCefrLevel("advanced academic debate"))
        assertEquals("B2", validator.inferCefrLevel("argument presentation"))
        assertEquals("A1", validator.inferCefrLevel("kids alphabet"))
        assertEquals("A2", validator.inferCefrLevel("simple warmup"))
    }
}
