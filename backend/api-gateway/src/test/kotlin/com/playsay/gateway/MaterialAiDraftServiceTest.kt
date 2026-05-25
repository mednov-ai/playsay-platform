package com.playsay.gateway

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MaterialAiDraftServiceTest {
    @Test
    fun `openai provider parses structured response and enriches source metadata`() {
        val transport = RecordingOpenAiTransport(openAiResponse(openAiDraftJson()))
        val provider = OpenAiMaterialAiDraftProvider(
            transport = transport,
            apiKey = "test-key",
            model = "gpt-5.4-mini",
            baseUrl = "https://api.openai.com/v1",
        )

        val draft = provider.draft(
            MaterialAiDraftInput(
                title = "Travel food",
                prompt = "B1 travel food speaking lesson",
                language = "en",
                cefrLevel = "B1",
            ),
        )

        assertEquals("Travel food", draft.title)
        assertEquals("B1", draft.cefrLevel)
        assertEquals("PRIVATE", draft.visibility)
        assertEquals("DRAFT", draft.status)
        assertEquals("openai", draft.sourceMeta["provider"].asText())
        assertEquals("gpt-5.4-mini", draft.sourceMeta["model"].asText())
        assertEquals("text", draft.document["pages"][0]["blocks"][0]["type"].asText())
        assertTrue(transport.requestBody.contains("\"text\""))
        assertTrue(transport.requestBody.contains("\"json_schema\""))
    }

    @Test
    fun `openai provider sends scan image as multimodal input without storing image data in source metadata`() {
        val transport = RecordingOpenAiTransport(openAiResponse(openAiDraftJson()))
        val provider = OpenAiMaterialAiDraftProvider(
            transport = transport,
            apiKey = "test-key",
            model = "gpt-5.4-mini",
            baseUrl = "https://api.openai.com/v1",
        )
        val dataUrl = "data:image/png;base64,iVBORw0KGgo="

        val draft = provider.draft(
            MaterialAiDraftInput(
                title = "Articles",
                prompt = "Create an editable A1 grammar worksheet from the attached scan",
                language = "en",
                cefrLevel = "A1",
                sourceImageDataUrl = dataUrl,
                sourceFileName = "articles.png",
            ),
        )

        assertEquals("scan", draft.sourceMeta["sourceType"].asText())
        assertEquals("articles.png", draft.sourceMeta["sourceFileName"].asText())
        assertTrue(draft.sourceMeta["sourceImageDataUrl"] == null)
        assertTrue(transport.requestBody.contains("\"type\":\"input_image\""))
        assertTrue(transport.requestBody.contains("\"image_url\":\"$dataUrl\""))
        assertTrue(transport.requestBody.contains("\"detail\":\"high\""))
        assertTrue(transport.requestBody.contains("first solve the worksheet"))
        assertTrue(transport.requestBody.contains("Turn worksheet blanks into interactive exercise items"))
        assertTrue(transport.requestBody.contains("Preserve every visible worksheet blank"))
        assertTrue(transport.requestBody.contains("classify the worksheet type"))
        assertTrue(transport.requestBody.contains("use matchingPairs blocks"))
        assertTrue(transport.requestBody.contains("\"matchingPairs\""))
        assertTrue(transport.requestBody.contains("\"pairs\""))
        assertTrue(transport.requestBody.contains("each blank item must provide choices"))
        assertTrue(transport.requestBody.contains("singular countable nouns use a/an by sound"))
    }

    @Test
    fun `openai provider normalizes common article answers from generated worksheets`() {
        val transport = RecordingOpenAiTransport(openAiResponse(openAiArticleDraftJson()))
        val provider = OpenAiMaterialAiDraftProvider(
            transport = transport,
            apiKey = "test-key",
            model = "gpt-5.4-mini",
            baseUrl = "https://api.openai.com/v1",
        )

        val draft = provider.draft(
            MaterialAiDraftInput(
                title = "Articles",
                prompt = "Create an editable A1 article worksheet from the attached scan",
                language = "en",
                cefrLevel = "A1",
                sourceImageDataUrl = "data:image/png;base64,iVBORw0KGgo=",
                sourceFileName = "articles.png",
            ),
        )

        val items = draft.document["pages"][0]["blocks"][0]["items"]
        assertEquals("-", items[0]["answer"].asText())
        assertEquals("an", items[1]["answer"].asText())
        assertEquals("-", items[2]["answer"].asText())
        assertEquals("a", items[3]["answer"].asText())
        assertEquals("-", items[4]["correct"].asText())
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

    private fun openAiResponse(outputText: String): String =
        """
        {
          "id": "resp_test",
          "output": [
            {
              "type": "message",
              "content": [
                {
                  "type": "output_text",
                  "text": ${jsonString(outputText)}
                }
              ]
            }
          ]
        }
        """.trimIndent()

    private fun openAiDraftJson(): String =
        """
        {
          "title": "Travel food",
          "description": "Speaking lesson about food while travelling.",
          "language": "en",
          "cefrLevel": "B1",
          "visibility": "PRIVATE",
          "status": "DRAFT",
          "document": {
            "schemaVersion": 1,
            "pages": [
              {
                "id": "page-1",
                "title": "Travel food",
                "layout": "FLOW",
                "blocks": [
                  {
                    "id": "block-1",
                    "type": "text",
                    "title": "Warm-up",
                    "body": "Talk about your favourite food when you travel.",
                    "instruction": null,
                    "prompt": null,
                    "level": null,
                    "language": null,
                    "url": null,
                    "provider": null,
                    "caption": null,
                    "imageUrl": null,
                    "alt": null,
                    "height": null,
                    "minWords": null,
                    "cards": [],
                    "items": [],
                    "options": []
                  }
                ]
              }
            ]
          },
          "sourceMeta": {
            "kind": "AI_GENERATED",
            "provider": "openai",
            "sourceType": "teacher_prompt",
            "inputSummary": "B1 travel food speaking lesson",
            "notes": "Original live lesson draft."
          },
          "scoringRubric": {
            "maxScore": 10,
            "criteria": [
              { "key": "taskCompletion", "label": "Task completion", "weight": 4 },
              { "key": "grammar", "label": "Grammar", "weight": 2 },
              { "key": "vocabulary", "label": "Vocabulary", "weight": 2 },
              { "key": "fluency", "label": "Fluency", "weight": 2 }
            ],
            "analysisFlags": ["taskCompletion", "grammar", "vocabulary", "fluency"]
          }
        }
        """.trimIndent()

    private fun openAiArticleDraftJson(): String =
        """
        {
          "title": "Articles",
          "description": "Interactive article worksheet.",
          "language": "en",
          "cefrLevel": "A1",
          "visibility": "PRIVATE",
          "status": "DRAFT",
          "document": {
            "schemaVersion": 1,
            "pages": [
              {
                "id": "page-1",
                "title": "Articles",
                "layout": "FLOW",
                "blocks": [
                  {
                    "id": "block-1",
                    "type": "fillGaps",
                    "title": "Articles practice",
                    "body": null,
                    "instruction": "Choose a, an, or no article.",
                    "prompt": null,
                    "level": null,
                    "language": null,
                    "url": null,
                    "provider": null,
                    "caption": null,
                    "imageUrl": null,
                    "alt": null,
                    "height": null,
                    "minWords": null,
                    "cards": [],
                    "items": [
                      { "prompt": "It is ___ white.", "answer": "a", "correct": "a", "choices": ["a", "an", "-"] },
                      { "prompt": "___ apple", "answer": "a", "correct": "a", "choices": ["a", "an", "-"] },
                      { "prompt": "___ tea", "answer": "a", "correct": "a", "choices": ["a", "an", "-"] },
                      { "prompt": "It is ___ red pencil.", "answer": "-", "correct": "-", "choices": ["a", "an", "-"] },
                      { "prompt": "___ children", "answer": "a", "correct": "a", "choices": ["a", "an", "-"] }
                    ],
                    "options": []
                  }
                ]
              }
            ]
          },
          "sourceMeta": {
            "kind": "AI_GENERATED",
            "provider": "openai",
            "sourceType": "scan",
            "inputSummary": "A1 article worksheet",
            "notes": "Scan converted to article choices."
          },
          "scoringRubric": {
            "maxScore": 10,
            "criteria": [
              { "key": "taskCompletion", "label": "Task completion", "weight": 4 },
              { "key": "grammar", "label": "Grammar", "weight": 2 },
              { "key": "vocabulary", "label": "Vocabulary", "weight": 2 },
              { "key": "fluency", "label": "Fluency", "weight": 2 }
            ],
            "analysisFlags": ["taskCompletion", "grammar", "vocabulary", "fluency"]
          }
        }
        """.trimIndent()

    private fun jsonString(value: String): String =
        buildString {
            append('"')
            value.forEach { char ->
                when (char) {
                    '\\' -> append("\\\\")
                    '"' -> append("\\\"")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> append(char)
                }
            }
            append('"')
        }
}
