package com.playsay.gateway

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

data class MaterialAiDraftInput(
    val title: String,
    val prompt: String,
    val language: String,
    val cefrLevel: String,
    val sourceImageDataUrl: String? = null,
    val sourceFileName: String? = null,
)

@Component
class MaterialAiDraftService(
    @param:Value("\${playsay.ai.provider:stub}") private val provider: String,
    private val stubProvider: StubMaterialAiDraftProvider,
    private val openAiProvider: OpenAiMaterialAiDraftProvider,
) {
    fun draft(input: MaterialAiDraftInput): LessonMaterialDraftResponse =
        when (provider.trim().lowercase()) {
            "", "stub" -> stubProvider.draft(input)
            "openai" -> openAiProvider.draft(input)
            else -> throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Unknown AI material provider.")
        }
}

@Component
class StubMaterialAiDraftProvider {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun draft(input: MaterialAiDraftInput): LessonMaterialDraftResponse {
        val sourceMeta = objectMapper.createObjectNode()
            .put("kind", "AI_STUB")
            .put("provider", "stub")
            .put("sourceType", if (input.hasSourceImage()) "scan" else "teacher_prompt")
            .put("prompt", input.prompt)
            .put("note", "Deterministic fallback draft; configure PLAYSAY_AI_PROVIDER=openai for live generation.")
        input.sourceFileName?.let { fileName -> sourceMeta.put("sourceFileName", fileName) }

        return LessonMaterialDraftResponse(
            title = input.title,
            description = "Черновик по описанию: ${input.prompt.take(180)}",
            language = input.language,
            cefrLevel = input.cefrLevel,
            visibility = "PRIVATE",
            status = "DRAFT",
            document = stubAiDraftDocument(input, objectMapper),
            sourceMeta = sourceMeta,
            scoringRubric = materialAiDefaultScoringRubric(objectMapper),
        )
    }
}

@Component
class OpenAiMaterialAiDraftProvider(
    private val transport: OpenAiResponsesTransport,
    @param:Value("\${playsay.ai.openai.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.ai.openai.model:gpt-5.4-mini}") private val model: String,
    @param:Value("\${playsay.ai.openai.base-url:https://api.openai.com/v1}") private val baseUrl: String,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun draft(input: MaterialAiDraftInput): LessonMaterialDraftResponse {
        val cleanApiKey = apiKey.trim()
        val cleanModel = model.trim().ifEmpty { "gpt-5.4-mini" }
        val cleanBaseUrl = baseUrl.trim().ifEmpty { "https://api.openai.com/v1" }
        if (cleanApiKey.isEmpty()) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "OpenAI API key is not configured.")
        }

        val requestBody = objectMapper.writeValueAsString(openAiRequest(input, cleanModel))
        val rawResponse = try {
            transport.createResponse(cleanBaseUrl, cleanApiKey, requestBody)
        } catch (exception: OpenAiTransportException) {
            val status = if (exception.statusCode in setOf(401, 403)) {
                HttpStatus.SERVICE_UNAVAILABLE
            } else {
                HttpStatus.BAD_GATEWAY
            }
            throw ResponseStatusException(status, "OpenAI material generation failed.")
        } catch (exception: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI material generation failed.")
        }

        val responseNode = parseJson(rawResponse)
        val outputText = responseNode.outputText()
            ?: throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI response did not contain generated material.")
        val draftNode = parseJson(outputText)
        val draft = runCatching { objectMapper.treeToValue(draftNode, LessonMaterialDraftResponse::class.java) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI response did not match material schema.") }

        validateDraft(draft)
        return draft.withOpenAiSourceMeta(objectMapper, input, cleanModel)
    }

    private fun openAiRequest(input: MaterialAiDraftInput, cleanModel: String): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("model", cleanModel)
            put("max_output_tokens", 8_000)
            putArray("input")
                .add(openAiMessage("system", materialAiSystemPrompt))
                .add(openAiMessage("user", materialAiUserPrompt(input), input.sourceImageDataUrl))
            set<JsonNode>(
                "text",
                objectMapper.createObjectNode().apply {
                    set<JsonNode>(
                        "format",
                        objectMapper.createObjectNode().apply {
                            put("type", "json_schema")
                            put("name", "playsay_lesson_material_draft")
                            set<JsonNode>("schema", materialDraftJsonSchema())
                            put("strict", true)
                        },
                    )
                },
            )
        }

    private fun openAiMessage(role: String, content: String, imageDataUrl: String? = null): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("role", role)
            putArray("content").apply {
                add(
                    objectMapper.createObjectNode().apply {
                        put("type", "input_text")
                        put("text", content)
                    },
                )
                imageDataUrl?.let { dataUrl ->
                    add(
                        objectMapper.createObjectNode().apply {
                            put("type", "input_image")
                            put("image_url", dataUrl)
                            put("detail", "high")
                        },
                    )
                }
            }
        }

    private fun parseJson(raw: String): JsonNode =
        runCatching { objectMapper.readTree(raw) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI response was not valid JSON.") }

    private fun materialDraftJsonSchema(): JsonNode =
        objectMapper.readTree(materialDraftJsonSchemaJson)
}

interface OpenAiResponsesTransport {
    fun createResponse(baseUrl: String, apiKey: String, requestBody: String): String
}

@Component
class JavaOpenAiResponsesTransport : OpenAiResponsesTransport {
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    override fun createResponse(baseUrl: String, apiKey: String, requestBody: String): String {
        val endpoint = "${baseUrl.trimEnd('/')}/responses"
        val request = HttpRequest.newBuilder(URI.create(endpoint))
            .timeout(Duration.ofSeconds(75))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
            .build()

        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
        if (response.statusCode() !in 200..299) {
            throw OpenAiTransportException(response.statusCode())
        }
        return response.body()
    }
}

class OpenAiTransportException(val statusCode: Int) : RuntimeException("OpenAI API returned HTTP $statusCode")

private fun JsonNode.outputText(): String? {
    get("output_text")?.takeIf { node -> node.isTextual }?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }?.let {
        return it
    }

    val output = get("output") as? ArrayNode ?: return null
    output.forEach { item ->
        val content = item.get("content") as? ArrayNode ?: return@forEach
        content.forEach { contentItem ->
            val text = contentItem.get("text")?.takeIf { node -> node.isTextual }?.asText()?.trim()
            if (text?.isNotEmpty() == true) {
                return text
            }
        }
    }
    return null
}

private fun LessonMaterialDraftResponse.withOpenAiSourceMeta(
    objectMapper: ObjectMapper,
    input: MaterialAiDraftInput,
    model: String,
): LessonMaterialDraftResponse {
    val meta = if (sourceMeta is ObjectNode) sourceMeta.deepCopy<ObjectNode>() else objectMapper.createObjectNode()
    meta.put("kind", "AI_GENERATED")
    meta.put("provider", "openai")
    meta.put("model", model)
    meta.put("prompt", input.prompt)
    meta.put("sourceType", if (input.hasSourceImage()) "scan" else "teacher_prompt")
    meta.put("requestedTitle", input.title)
    meta.put("requestedLanguage", input.language)
    meta.put("requestedCefrLevel", input.cefrLevel)
    input.sourceFileName?.let { fileName -> meta.put("sourceFileName", fileName) }

    return copy(
        title = title.trim().ifEmpty { input.title }.take(160),
        description = description?.trim()?.take(2_000),
        language = language.trim().ifEmpty { input.language }.take(16),
        cefrLevel = cefrLevel.trim().uppercase().takeIf { level -> level in materialAiCefrLevels } ?: input.cefrLevel,
        visibility = "PRIVATE",
        status = "DRAFT",
        sourceMeta = meta,
    )
}

private fun validateDraft(draft: LessonMaterialDraftResponse) {
    if (draft.title.isBlank() || draft.title.length > 160) {
        throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI generated an invalid material title.")
    }
    if (draft.language.isBlank() || draft.language.length > 16 || draft.cefrLevel !in materialAiCefrLevels) {
        throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI generated invalid material metadata.")
    }
    if (draft.document.get("schemaVersion")?.asInt() != 1 || draft.document.get("pages") !is ArrayNode) {
        throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI generated an invalid material document.")
    }
    if (draft.scoringRubric.get("maxScore")?.asInt() != 10) {
        throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI generated an invalid scoring rubric.")
    }

    (draft.document.get("pages") as ArrayNode).forEach { page ->
        val blocks = page.get("blocks") as? ArrayNode
            ?: throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI generated a material page without blocks.")
        blocks.forEach { block ->
            val type = block.get("type")?.asText()
            if (type !in materialAiBlockTypes) {
                throw ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI generated an unsupported material block.")
            }
        }
    }
}

private fun materialAiUserPrompt(input: MaterialAiDraftInput): String =
    """
    Create a Play&Say lesson material draft.

    Teacher request:
    ${input.prompt}

    Requested title: ${input.title}
    Language: ${input.language}
    CEFR level: ${input.cefrLevel}
    Lesson format: infer individual/group if the request mentions it.
    Source image attached: ${if (input.hasSourceImage()) "yes" else "no"}.
    Source file name: ${input.sourceFileName ?: "not provided"}.

    Requirements:
    - Build a practical live lesson for children learning English.
    - If a source image is attached, first solve the worksheet yourself, then convert it into editable Play&Say blocks.
    - Do not merely translate or copy the scan as text. Turn worksheet blanks into interactive exercise items.
    - Preserve every visible worksheet blank as an interactive item, grouped by the original section order, before adding any invented follow-up activity.
    - Do not drop later worksheet sections and do not replace the worksheet with a shorter practice set unless the scan is unreadable.
    - For fill-in-article or grammar worksheet scans, use fillGaps or multipleChoice items with concise prompts, the correct answer, and choices.
    - For a/an article tasks, each blank item must provide choices ["a", "an", "-"] and an answer such as "a", "an", or "-".
    - Keep the blank marker in item prompts, for example "___ apple" or "It is ___ girl.", so the renderer can place the combobox at the blank.
    - For sentence tasks, keep the full visible sentence with the blank marker and solve from grammar context.
    - Prefer 4-8 blocks: warm-up text, vocabulary/flashcards, one controlled exercise, one speaking task, one writing or drawing task.
    - Use supported block types only.
    - For unused block fields, return null or an empty array as required by the schema.
    - Keep all teacher-facing text concise.
    - Do not copy long copyrighted source text verbatim; transform it into original activities.
    - Keep status DRAFT and visibility PRIVATE.
    """.trimIndent()

private fun MaterialAiDraftInput.hasSourceImage(): Boolean = sourceImageDataUrl?.isNotBlank() == true

private val materialAiSystemPrompt = """
    You are Play&Say lesson material builder for an online English school for children.

    Return only structured data that matches the provided JSON schema.
    Do not output HTML or Markdown.
    Create safe, age-appropriate English lesson material.
    Infer CEFR carefully when needed, but respect the requested level when provided.
    Include a 10-point scoring rubric and analysis flags.
    Materials are used in live individual and group video lessons, so tasks must be easy for a teacher to run during a lesson.
""".trimIndent()

private fun stubAiDraftDocument(input: MaterialAiDraftInput, objectMapper: ObjectMapper): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("schemaVersion", 1)
        putArray("pages").add(
            objectMapper.createObjectNode().apply {
                put("id", "page-warmup")
                put("title", input.title)
                put("layout", "FLOW")
                val blocks = putArray("blocks")
                blocks.add(materialAiTextBlock(objectMapper, "block-goal", "Цель урока", input.prompt))
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-vocab")
                        put("type", "flashcards")
                        put("title", "Useful words")
                        putArray("cards")
                            .add(materialAiFlashcard(objectMapper, "topic", "topic", "тема", "Let's discuss this topic."))
                            .add(materialAiFlashcard(objectMapper, "opinion", "opinion", "мнение", "I think it is useful."))
                            .add(materialAiFlashcard(objectMapper, "because", "because", "потому что", "I agree because..."))
                    },
                )
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-gap")
                        put("type", "fillGaps")
                        put("title", "Complete the ideas")
                        put("instruction", "Choose words that fit the meaning.")
                        putArray("items")
                            .add(materialAiGapItem(objectMapper, "I can talk about ___ in English.", "this topic"))
                            .add(materialAiGapItem(objectMapper, "My opinion is ___ because it is useful.", "positive"))
                    },
                )
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-speaking")
                        put("type", "speakingPrompt")
                        put("title", "Let's speak")
                        put("prompt", "Ask your partner three questions about the topic, then share one answer.")
                        put("level", input.cefrLevel)
                        put("language", input.language)
                    },
                )
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-writing")
                        put("type", "freeWriting")
                        put("title", "Short answer")
                        put("prompt", "Write 3-5 sentences using the new words.")
                        put("minWords", 20)
                    },
                )
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-drawing")
                        put("type", "drawingArea")
                        put("title", "Teacher notes")
                        put("height", 220)
                    },
                )
            },
        )
    }

private fun materialAiTextBlock(objectMapper: ObjectMapper, id: String, title: String, body: String): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("id", id)
        put("type", "text")
        put("title", title)
        put("body", body)
    }

private fun materialAiFlashcard(objectMapper: ObjectMapper, id: String, front: String, back: String, example: String): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("id", id)
        put("front", front)
        put("back", back)
        put("example", example)
    }

private fun materialAiGapItem(objectMapper: ObjectMapper, prompt: String, answer: String): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("prompt", prompt)
        put("answer", answer)
    }

private fun materialAiDefaultScoringRubric(objectMapper: ObjectMapper): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("maxScore", 10)
        putArray("criteria")
            .add(materialAiCriteria(objectMapper, "taskCompletion", "Выполнение задания", 4))
            .add(materialAiCriteria(objectMapper, "grammar", "Грамматика", 2))
            .add(materialAiCriteria(objectMapper, "vocabulary", "Лексика", 2))
            .add(materialAiCriteria(objectMapper, "fluency", "Беглость/самостоятельность", 2))
        putArray("analysisFlags")
            .add("taskCompletion")
            .add("grammar")
            .add("vocabulary")
            .add("spelling")
    }

private fun materialAiCriteria(objectMapper: ObjectMapper, key: String, label: String, weight: Int): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("key", key)
        put("label", label)
        put("weight", weight)
    }

private val materialAiCefrLevels = setOf("A1", "A2", "B1", "B2", "C1", "C2")
private val materialAiBlockTypes = setOf(
    "text",
    "videoEmbed",
    "image",
    "generatedImage",
    "flashcards",
    "fillGaps",
    "multipleChoice",
    "freeWriting",
    "speakingPrompt",
    "drawingArea",
)

private val materialDraftJsonSchemaJson = """
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "maxLength": 160 },
    "description": { "type": ["string", "null"], "maxLength": 2000 },
    "language": { "type": "string", "maxLength": 16 },
    "cefrLevel": { "type": "string", "enum": ["A1", "A2", "B1", "B2", "C1", "C2"] },
    "visibility": { "type": "string", "enum": ["PRIVATE"] },
    "status": { "type": "string", "enum": ["DRAFT"] },
    "document": {
      "type": "object",
      "properties": {
        "schemaVersion": { "type": "integer", "enum": [1] },
        "pages": {
          "type": "array",
          "minItems": 1,
          "maxItems": 6,
          "items": { "${'$'}ref": "#/${'$'}defs/page" }
        }
      },
      "required": ["schemaVersion", "pages"],
      "additionalProperties": false
    },
    "sourceMeta": {
      "type": "object",
      "properties": {
        "kind": { "type": "string", "enum": ["AI_GENERATED"] },
        "provider": { "type": "string", "enum": ["openai"] },
        "sourceType": { "type": "string", "enum": ["teacher_prompt", "scan", "external_url", "voice_description", "mixed"] },
        "inputSummary": { "type": "string", "maxLength": 1000 },
        "notes": { "type": "string", "maxLength": 1000 }
      },
      "required": ["kind", "provider", "sourceType", "inputSummary", "notes"],
      "additionalProperties": false
    },
    "scoringRubric": {
      "type": "object",
      "properties": {
        "maxScore": { "type": "integer", "enum": [10] },
        "criteria": {
          "type": "array",
          "minItems": 4,
          "maxItems": 6,
          "items": { "${'$'}ref": "#/${'$'}defs/criterion" }
        },
        "analysisFlags": {
          "type": "array",
          "minItems": 3,
          "maxItems": 8,
          "items": {
            "type": "string",
            "enum": ["taskCompletion", "grammar", "vocabulary", "spelling", "fluency", "pronunciation", "comprehension", "participation"]
          }
        }
      },
      "required": ["maxScore", "criteria", "analysisFlags"],
      "additionalProperties": false
    }
  },
  "required": ["title", "description", "language", "cefrLevel", "visibility", "status", "document", "sourceMeta", "scoringRubric"],
  "additionalProperties": false,
  "${'$'}defs": {
    "page": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "maxLength": 80 },
        "title": { "type": "string", "maxLength": 160 },
        "layout": { "type": "string", "enum": ["FLOW", "CANVAS"] },
        "blocks": {
          "type": "array",
          "minItems": 1,
          "maxItems": 12,
          "items": { "${'$'}ref": "#/${'$'}defs/block" }
        }
      },
      "required": ["id", "title", "layout", "blocks"],
      "additionalProperties": false
    },
    "block": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "maxLength": 80 },
        "type": { "type": "string", "enum": ["text", "videoEmbed", "image", "generatedImage", "flashcards", "fillGaps", "multipleChoice", "freeWriting", "speakingPrompt", "drawingArea"] },
        "title": { "type": "string", "maxLength": 160 },
        "body": { "type": ["string", "null"], "maxLength": 4000 },
        "instruction": { "type": ["string", "null"], "maxLength": 1000 },
        "prompt": { "type": ["string", "null"], "maxLength": 2000 },
        "level": { "type": ["string", "null"], "maxLength": 16 },
        "language": { "type": ["string", "null"], "maxLength": 16 },
        "url": { "type": ["string", "null"], "maxLength": 4000 },
        "provider": { "type": ["string", "null"], "maxLength": 32 },
        "caption": { "type": ["string", "null"], "maxLength": 1000 },
        "imageUrl": { "type": ["string", "null"], "maxLength": 4000 },
        "alt": { "type": ["string", "null"], "maxLength": 500 },
        "height": { "type": ["integer", "null"], "minimum": 120, "maximum": 800 },
        "minWords": { "type": ["integer", "null"], "minimum": 1, "maximum": 300 },
        "cards": {
          "type": "array",
          "maxItems": 12,
          "items": { "${'$'}ref": "#/${'$'}defs/flashcard" }
        },
        "items": {
          "type": "array",
          "maxItems": 20,
          "items": { "${'$'}ref": "#/${'$'}defs/exerciseItem" }
        },
        "options": {
          "type": "array",
          "maxItems": 8,
          "items": { "type": "string", "maxLength": 160 }
        }
      },
      "required": ["id", "type", "title", "body", "instruction", "prompt", "level", "language", "url", "provider", "caption", "imageUrl", "alt", "height", "minWords", "cards", "items", "options"],
      "additionalProperties": false
    },
    "flashcard": {
      "type": "object",
      "properties": {
        "id": { "type": "string", "maxLength": 80 },
        "front": { "type": "string", "maxLength": 160 },
        "back": { "type": "string", "maxLength": 160 },
        "example": { "type": "string", "maxLength": 300 }
      },
      "required": ["id", "front", "back", "example"],
      "additionalProperties": false
    },
    "exerciseItem": {
      "type": "object",
      "properties": {
        "prompt": { "type": "string", "maxLength": 1000 },
        "answer": { "type": ["string", "null"], "maxLength": 500 },
        "correct": { "type": ["string", "null"], "maxLength": 500 },
        "choices": {
          "type": "array",
          "maxItems": 8,
          "items": { "type": "string", "maxLength": 160 }
        }
      },
      "required": ["prompt", "answer", "correct", "choices"],
      "additionalProperties": false
    },
    "criterion": {
      "type": "object",
      "properties": {
        "key": { "type": "string", "maxLength": 80 },
        "label": { "type": "string", "maxLength": 160 },
        "weight": { "type": "integer", "minimum": 1, "maximum": 10 }
      },
      "required": ["key", "label", "weight"],
      "additionalProperties": false
    }
  }
}
""".trimIndent()
