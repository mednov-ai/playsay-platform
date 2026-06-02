package com.playsay.gateway.service

import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.error.ProjectResponseException
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
