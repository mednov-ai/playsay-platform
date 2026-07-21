package com.playsay.gateway

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.service.MaterialAnswerSuggestionInput
import com.playsay.gateway.service.OpenAiMaterialAnswerSuggestionProvider
import com.playsay.gateway.service.OpenAiResponsesTransport
import com.playsay.gateway.service.materialAnswerItemContexts
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class MaterialAnswerSuggestionServiceTest {
    private val objectMapper = jacksonObjectMapper()

    @Test
    fun `answer suggestion context joins continuation thread and keeps full block context`() {
        val block = objectMapper.readTree(
            """
            {
              "id": "gaps",
              "type": "fillGaps",
              "title": "Cafe choices",
              "items": [
                {
                  "id": "root",
                  "prompt": "She looked at the menu ___",
                  "answer": "carefully"
                },
                {
                  "id": "continuation-one",
                  "threadRootItemId": "root",
                  "prompt": "and decided to order ___",
                  "answer": "tea"
                },
                {
                  "id": "continuation-two",
                  "threadRootItemId": "root",
                  "prompt": "because the cafe was quiet.",
                  "answer": ""
                },
                {
                  "id": "other",
                  "prompt": "They were discussing ___ schedule.",
                  "answer": "their"
                }
              ]
            }
            """.trimIndent(),
        ) as ObjectNode

        val context = materialAnswerItemContexts(block).single { item -> item.itemId == "continuation-one" }

        assertEquals(
            "She looked at the menu ___ and decided to order ___ because the cafe was quiet.",
            context.itemContextPrompt,
        )
        assertTrue(context.blockContextPrompt.contains("She looked at the menu ___"))
        assertTrue(context.blockContextPrompt.contains("and decided to order ___"))
        assertTrue(context.blockContextPrompt.contains("They were discussing ___ schedule."))
    }

    @Test
    fun `openai answer suggestion prompt includes sentence thread and block context`() {
        val transport = RecordingOpenAiTransport(answerSuggestionResponse())
        val provider = OpenAiMaterialAnswerSuggestionProvider(
            transport = transport,
            apiKey = "test-key",
            model = "gpt-5.4-mini",
            baseUrl = "https://api.openai.com/v1",
            reasoningEffort = "low",
        )

        provider.suggest(
            MaterialAnswerSuggestionInput(
                materialTitle = "Cafe choices",
                language = "en",
                cefrLevel = "A2",
                blockTitle = "Cafe choices",
                blockType = "fillGaps",
                itemId = "continuation-one",
                prompt = "and decided to order ___",
                itemContextPrompt = "She looked at the menu ___ and decided to order ___.",
                blockContextPrompt = "1. She looked at the menu ___ and decided to order ___.\n2. They were discussing ___ schedule.",
                answer = "tea",
                acceptedAnswers = emptyList(),
                options = emptyList(),
            ),
        )

        assertTrue(transport.requestBody.contains("Sentence/thread context: She looked at the menu ___ and decided to order ___."))
        assertTrue(transport.requestBody.contains("Block context: 1. She looked at the menu ___ and decided to order ___."))
        assertTrue(transport.requestBody.contains("2. They were discussing ___ schedule."))
        assertTrue(transport.requestBody.contains("\"reasoning\":{\"effort\":\"low\"}"))
    }

    @Test
    fun `openai answer provider rejects unsupported reasoning effort during construction`() {
        assertFailsWith<IllegalArgumentException> {
            OpenAiMaterialAnswerSuggestionProvider(
                transport = RecordingOpenAiTransport(answerSuggestionResponse()),
                apiKey = "test-key",
                model = "gpt-5.4-mini",
                baseUrl = "https://api.openai.com/v1",
                reasoningEffort = "fast",
            )
        }
    }

    @Test
    fun `openai answer suggestions include and enforce typed hint prefix`() {
        val transport = RecordingOpenAiTransport(
            """
            {
              "id": "resp_test",
              "output": [
                {
                  "type": "message",
                  "content": [
                    {
                      "type": "output_text",
                      "text": "{\"suggestions\":[{\"value\":\"went\",\"reason\":\"Wrong prefix.\",\"confidence\":0.82},{\"value\":\"going out\",\"reason\":\"Same prefix.\",\"confidence\":0.76}]}"
                    }
                  ]
                }
              ]
            }
            """.trimIndent(),
        )
        val provider = OpenAiMaterialAnswerSuggestionProvider(
            transport = transport,
            apiKey = "test-key",
            model = "gpt-5.4-mini",
            baseUrl = "https://api.openai.com/v1",
        )

        val suggestions = provider.suggest(
            MaterialAnswerSuggestionInput(
                materialTitle = "Gerunds",
                language = "en",
                cefrLevel = "A2",
                blockTitle = "Gerunds",
                blockType = "fillGaps",
                itemId = "item-going",
                prompt = "I do not enjoy ___ to the cinema.",
                itemContextPrompt = "I do not enjoy ___ to the cinema.",
                blockContextPrompt = "I do not enjoy ___ to the cinema.",
                answer = "going",
                acceptedAnswers = emptyList(),
                options = emptyList(),
                hintPrefix = "go",
            ),
        )

        assertTrue(transport.requestBody.contains("Required answer prefix: go"))
        assertEquals(listOf("going out"), suggestions.map { suggestion -> suggestion.value })
    }

    private class RecordingOpenAiTransport(
        private val responseBody: String,
    ) : OpenAiResponsesTransport {
        lateinit var requestBody: String

        override fun createResponse(baseUrl: String, apiKey: String, requestBody: String): String {
            assertEquals("https://api.openai.com/v1", baseUrl)
            assertEquals("test-key", apiKey)
            this.requestBody = requestBody
            return responseBody
        }
    }

    private fun answerSuggestionResponse(): String =
        """
        {
          "id": "resp_test",
          "output": [
            {
              "type": "message",
              "content": [
                {
                  "type": "output_text",
                  "text": "{\"suggestions\":[{\"value\":\"coffee\",\"reason\":\"Same cafe ordering context.\",\"confidence\":0.82}]}"
                }
              ]
            }
          ]
        }
        """.trimIndent()
}
