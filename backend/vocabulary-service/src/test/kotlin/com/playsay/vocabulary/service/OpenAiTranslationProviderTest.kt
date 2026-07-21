package com.playsay.vocabulary.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.vocabulary.dto.TranslationVariantResponse
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.content
import org.springframework.test.web.client.match.MockRestRequestMatchers.header
import org.springframework.test.web.client.match.MockRestRequestMatchers.method
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient

class OpenAiTranslationProviderTest {
    @Test
    fun `extracts all dictionary variants when a reasoning item precedes the message`() {
        val builder = RestClient.builder()
        val server = MockRestServiceServer.bindTo(builder).build()
        val provider = OpenAiTranslationProvider(builder, jacksonObjectMapper(), "test-key", baseUrl, "gpt-5.4-mini", "low")
        server.expect(requestTo("$baseUrl/responses"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("Authorization", "Bearer test-key"))
            .andExpect(content().string(containsString("vocabulary_translation_variants")))
            .andExpect(content().string(containsString("\"effort\":\"low\"")))
            .andExpect(content().string(containsString("\"maxItems\":3")))
            .andExpect(content().string(containsString("travel context")))
            .andExpect(content().string(containsString("previous meaning")))
            .andRespond(withSuccess(openAiResponse, MediaType.APPLICATION_JSON))

        val result = provider.suggest(
            sourceText = "book",
            sourceLanguage = "en",
            targetLanguage = "ru",
            context = "A travel context",
            instruction = "Show a verb meaning",
            previousTranslations = listOf("previous meaning"),
        )

        assertEquals("OPENAI", result.source)
        assertEquals(2, result.variants.size)
        assertEquals("бронировать", result.translation)
        assertEquals("verb", result.partOfSpeech)
        assertEquals("книга", result.variants[1].translation)
        server.verify()
    }

    @Test
    fun `returns unavailable without calling OpenAI when api key is blank`() {
        val builder = RestClient.builder()
        val server = MockRestServiceServer.bindTo(builder).build()
        val provider = OpenAiTranslationProvider(builder, jacksonObjectMapper(), " ", baseUrl, "gpt-5.4-mini")

        val result = provider.suggest("book", "en", "ru", null, null, emptyList())

        assertEquals("UNAVAILABLE", result.source)
        assertEquals(emptyList<TranslationVariantResponse>(), result.variants)
        server.verify()
    }

    @Test
    fun `rejects unsupported reasoning effort during construction`() {
        assertThrows(IllegalArgumentException::class.java) {
            OpenAiTranslationProvider(RestClient.builder(), jacksonObjectMapper(), "test-key", baseUrl, "gpt-5.4-mini", "quick")
        }
    }

    private companion object {
        const val baseUrl = "https://api.openai.com/v1"
        val openAiResponse = """
            {
              "status": "completed",
              "output": [
                { "type": "reasoning", "summary": [] },
                {
                  "type": "message",
                  "content": [
                    {
                      "type": "output_text",
                      "text": "{\"variants\":[{\"translation\":\"бронировать\",\"partOfSpeech\":\"verb\",\"example\":\"Book a room.\",\"exampleTranslation\":\"Забронируй номер.\"},{\"translation\":\"книга\",\"partOfSpeech\":\"noun\",\"example\":\"Read this book.\",\"exampleTranslation\":\"Прочитай эту книгу.\"}]}"
                    }
                  ]
                }
              ]
            }
        """.trimIndent()
    }
}
