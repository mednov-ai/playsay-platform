package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.Base64
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MaterialImageGenerationServiceTest {
    @Test
    fun `openai image provider requests safe workbook illustration and returns compact bytes`() {
        val transport = RecordingOpenAiImagesTransport(openAiImageResponse(testPngBase64()))
        val provider = OpenAiMaterialImageGenerationProvider(
            transport = transport,
            apiKey = "test-key",
            imageModel = "gpt-image-1-mini",
            baseUrl = "https://api.openai.com/v1",
        )

        val image = provider.generate(
            MaterialImageGenerationInput(
                prompt = "child-friendly workbook illustration of a fox",
                alt = "owl",
            ),
        )

        assertEquals("gpt-image-1-mini", image.model)
        assertEquals("image/jpeg", image.mimeType)
        assertTrue(image.bytes.isNotEmpty())
        assertTrue(transport.requestBody.contains("\"/images/generations\"").not())
        assertTrue(transport.requestBody.contains("\"model\":\"gpt-image-1-mini\""))
        assertTrue(transport.requestBody.contains("\"quality\":\"low\""))
        assertTrue(transport.requestBody.contains("\"prompt\":\"child-friendly workbook illustration of a fox\""))
        assertFalse(transport.requestBody.contains("owl"))
        assertFalse(transport.requestBody.contains("Create a new original illustration"))
        assertFalse(transport.requestBody.contains("Do not include text"))
    }

    private class RecordingOpenAiImagesTransport(
        private val responseBody: String,
    ) : OpenAiImagesTransport {
        lateinit var requestBody: String

        override fun createImage(baseUrl: String, apiKey: String, requestBody: String): String {
            assertEquals("https://api.openai.com/v1", baseUrl)
            assertEquals("test-key", apiKey)
            this.requestBody = requestBody
            return responseBody
        }
    }

    private fun openAiImageResponse(base64Image: String): String =
        """
        {
          "created": 1760000000,
          "data": [
            {
              "b64_json": "$base64Image",
              "revised_prompt": "A simple owl illustration."
            }
          ]
        }
        """.trimIndent()

    private fun testPngBase64(): String {
        val image = BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB)
        val graphics = image.createGraphics()
        graphics.color = Color.WHITE
        graphics.fillRect(0, 0, 8, 8)
        graphics.color = Color.ORANGE
        graphics.fillOval(1, 1, 6, 6)
        graphics.dispose()
        val output = ByteArrayOutputStream()
        ImageIO.write(image, "png", output)
        return Base64.getEncoder().encodeToString(output.toByteArray())
    }
}
