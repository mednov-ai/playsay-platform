package com.playsay.gateway

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.MaterialHtmlGameAiInput
import com.playsay.gateway.service.MaterialHtmlGameAiService
import com.playsay.gateway.service.material.OpenAiResponsesTransport
import com.playsay.gateway.utils.MetaData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class MaterialHtmlGameAiServiceTest {
    @Test
    fun `translates non english candidate into an english title`() {
        val transport = StaticTransport(response("Find the Rhyme"))
        val service = MaterialHtmlGameAiService("openai", transport, "test-key", "test-model", "https://api.openai.com/v1", "low")

        val result = service.analyze(MaterialHtmlGameAiInput("Найди рифму", true, "Match English rhyming words"))

        assertEquals("Find the Rhyme", result.title)
        assertEquals("AI", result.titleSource)
        assertTrue(transport.requestBody.contains("concise English game title"))
        assertTrue(transport.requestBody.contains("\"reasoning\":{\"effort\":\"low\"}"))
    }

    @Test
    fun `rejects unsupported reasoning effort during construction`() {
        assertFailsWith<IllegalArgumentException> {
            MaterialHtmlGameAiService("openai", StaticTransport(response("Find the Rhyme")), "test-key", "test-model", "https://api.openai.com/v1", "quick")
        }
    }

    @Test
    fun `preserves a clear english candidate`() {
        val service = MaterialHtmlGameAiService(
            "openai",
            StaticTransport(response("A Different AI Title")),
            "test-key",
            "test-model",
            "https://api.openai.com/v1",
        )

        val result = service.analyze(MaterialHtmlGameAiInput("Pair Up!", false, "Matching game"))

        assertEquals("Pair Up!", result.title)
        assertEquals("HTML", result.titleSource)
    }

    @Test
    fun `rejects ai title containing a non latin letter`() {
        val service = MaterialHtmlGameAiService(
            "openai",
            StaticTransport(response("Find Рифму")),
            "test-key",
            "test-model",
            "https://api.openai.com/v1",
        )

        val exception = assertFailsWith<ProjectResponseException> {
            service.analyze(MaterialHtmlGameAiInput("Найди рифму", true, "Rhyming words"))
        }

        assertEquals(MetaData.ErrorCodes.AI_HTML_GAME_TITLE_INVALID, exception.errorCode)
    }

    private class StaticTransport(private val responseBody: String) : OpenAiResponsesTransport {
        lateinit var requestBody: String

        override fun createResponse(baseUrl: String, apiKey: String, requestBody: String): String {
            this.requestBody = requestBody
            return responseBody
        }
    }

    private fun response(title: String): String =
        """
        {
          "output": [{
            "type": "message",
            "content": [{
              "type": "output_text",
              "text": "{\"title\":\"$title\",\"iconPrompt\":\"Friendly square icon, no text\"}"
            }]
          }]
        }
        """.trimIndent()
}
