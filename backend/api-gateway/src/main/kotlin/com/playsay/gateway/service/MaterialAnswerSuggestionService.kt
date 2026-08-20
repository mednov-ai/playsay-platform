package com.playsay.gateway.service

import com.playsay.gateway.service.material.OpenAiResponsesTransport
import com.playsay.gateway.service.material.OpenAiTransportException

import com.playsay.openai.validatedOpenAiReasoningEffort
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialAnswerSuggestion
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.math.BigDecimal
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

data class MaterialAnswerSuggestionInput(
    val materialTitle: String,
    val language: String,
    val cefrLevel: String,
    val blockTitle: String,
    val blockType: String,
    val itemId: String,
    val prompt: String,
    val itemContextPrompt: String = prompt,
    val blockContextPrompt: String = prompt,
    val answer: String?,
    val acceptedAnswers: List<String>,
    val options: List<String>,
    val hintPrefix: String = "",
)

@Component
class MaterialAnswerSuggestionService(
    @param:Value("\${playsay.ai.provider:stub}") private val provider: String,
    private val stubProvider: StubMaterialAnswerSuggestionProvider,
    private val openAiProvider: OpenAiMaterialAnswerSuggestionProvider,
) {
    fun suggest(input: MaterialAnswerSuggestionInput): List<MaterialAnswerSuggestion> =
        when (provider.trim().lowercase()) {
            "", "stub" -> stubProvider.suggest(input)
            "openai" -> openAiProvider.suggest(input)
            else -> throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.AI_ANSWER_SUGGESTION_PROVIDER_UNKNOWN)
        }
}

@Component
class StubMaterialAnswerSuggestionProvider {
    fun suggest(input: MaterialAnswerSuggestionInput): List<MaterialAnswerSuggestion> {
        val knownAnswers = input.acceptedAnswers.map(::normalizedAnswerSuggestionValue).toSet()
        val answer = input.answer?.trim()?.takeIf { value -> value.isNotEmpty() } ?: return emptyList()
        val candidates = buildList {
            addAll(pronounAnswerVariants(answer))
            addAll(gerundAnswerVariants(answer, input.itemContextPrompt.ifBlank { input.prompt }))
            addAll(shortAnswerVariants(answer, input.blockTitle, input.itemContextPrompt.ifBlank { input.prompt }))
        }
        return candidates
            .map { candidate -> candidate.trim().replace(Regex("\\s+"), " ") }
            .filter { candidate ->
                candidate.isNotEmpty() &&
                    normalizedAnswerSuggestionValue(candidate) !in knownAnswers &&
                    answerSuggestionMatchesPrefix(candidate, input.hintPrefix)
            }
            .distinctBy(::normalizedAnswerSuggestionValue)
            .take(5)
            .map { candidate ->
                MaterialAnswerSuggestion(
                    value = candidate,
                    reason = "Possible correct variant for the same grammar context.",
                    confidence = BigDecimal("0.72"),
                )
            }
    }
}

@Component
class OpenAiMaterialAnswerSuggestionProvider(
    private val transport: OpenAiResponsesTransport,
    @param:Value("\${playsay.ai.openai.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.ai.openai.model:gpt-5.4-mini}") private val model: String,
    @param:Value("\${playsay.ai.openai.base-url:https://api.openai.com/v1}") private val baseUrl: String,
    @param:Value("\${playsay.ai.openai.reasoning.answer-suggestion:medium}") reasoningEffort: String = "medium",
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()
    private val reasoningEffort = validatedOpenAiReasoningEffort(reasoningEffort, "medium")

    fun suggest(input: MaterialAnswerSuggestionInput): List<MaterialAnswerSuggestion> {
        val cleanApiKey = apiKey.trim()
        val cleanModel = model.trim().ifEmpty { "gpt-5.4-mini" }
        val cleanBaseUrl = baseUrl.trim().ifEmpty { "https://api.openai.com/v1" }
        if (cleanApiKey.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.AI_API_KEY_NOT_CONFIGURED)
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
            throw ProjectResponseException.localized(status, MetaData.ErrorCodes.AI_ANSWER_SUGGESTION_FAILED)
        } catch (exception: Exception) {
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.AI_ANSWER_SUGGESTION_FAILED)
        }

        val responseNode = parseJson(rawResponse)
        val outputText = responseNode.answerSuggestionOutputText()
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.AI_ANSWER_SUGGESTIONS_MISSING)
        val suggestionsNode = parseJson(outputText).get("suggestions") as? ArrayNode
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.AI_ANSWER_SUGGESTION_SCHEMA_INVALID)
        val knownAnswers = input.acceptedAnswers.map(::normalizedAnswerSuggestionValue).toSet()
        return suggestionsNode.mapNotNull { suggestion ->
            val value = suggestion.get("value")?.asText()?.trim()?.takeIf { item -> item.isNotEmpty() }
                ?: return@mapNotNull null
            if (normalizedAnswerSuggestionValue(value) in knownAnswers) {
                return@mapNotNull null
            }
            if (!answerSuggestionMatchesPrefix(value, input.hintPrefix)) {
                return@mapNotNull null
            }
            MaterialAnswerSuggestion(
                value = value.take(160),
                reason = suggestion.get("reason")?.asText()?.trim()?.take(240)
                    ?: "Possible correct variant for the same grammar context.",
                confidence = suggestion.get("confidence")?.takeIf { node -> node.isNumber }?.decimalValue()
                    ?.max(BigDecimal.ZERO)
                    ?.min(BigDecimal.ONE)
                    ?: BigDecimal("0.50"),
            )
        }.distinctBy { suggestion -> normalizedAnswerSuggestionValue(suggestion.value) }.take(5)
    }

    private fun openAiRequest(input: MaterialAnswerSuggestionInput, cleanModel: String): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("model", cleanModel)
            put("max_output_tokens", 1_000)
            set<JsonNode>("reasoning", objectMapper.createObjectNode().put("effort", reasoningEffort))
            putArray("input")
                .add(openAiMessage("system", materialAnswerSuggestionSystemPrompt))
                .add(openAiMessage("user", materialAnswerSuggestionUserPrompt(input)))
            set<JsonNode>(
                "text",
                objectMapper.createObjectNode().apply {
                    set<JsonNode>(
                        "format",
                        objectMapper.createObjectNode().apply {
                            put("type", "json_schema")
                            put("name", "playsay_answer_suggestions")
                            set<JsonNode>("schema", materialAnswerSuggestionSchema())
                            put("strict", true)
                        },
                    )
                },
            )
        }

    private fun openAiMessage(role: String, content: String): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("role", role)
            putArray("content").add(
                objectMapper.createObjectNode().apply {
                    put("type", "input_text")
                    put("text", content)
                },
            )
        }

    private fun materialAnswerSuggestionSchema(): JsonNode =
        objectMapper.readTree(materialAnswerSuggestionSchemaJson)

    private fun parseJson(raw: String): JsonNode =
        runCatching { objectMapper.readTree(raw) }
            .getOrElse { throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.AI_RESPONSE_INVALID_JSON) }
}

private fun JsonNode.answerSuggestionOutputText(): String? {
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

private fun materialAnswerSuggestionUserPrompt(input: MaterialAnswerSuggestionInput): String =
    """
    Suggest additional accepted answers for one Honey School exercise item.

    Material: ${input.materialTitle}
    Language: ${input.language}
    CEFR: ${input.cefrLevel}
    Block: ${input.blockTitle} (${input.blockType})
    Item id: ${input.itemId}
    Prompt: ${input.prompt}
    Sentence/thread context: ${input.itemContextPrompt.ifBlank { input.prompt }}
    Block context: ${input.blockContextPrompt.ifBlank { input.prompt }}
    Primary answer: ${input.answer ?: ""}
    Already accepted answers: ${input.acceptedAnswers.joinToString(", ")}
    Visible options: ${input.options.joinToString(", ")}
    Required answer prefix: ${input.hintPrefix}

    Requirements:
    - Return only variants that should be accepted as correct for the same grammar meaning.
    - Treat continuation cards in the sentence/thread context as one connected sentence.
    - Use the full block context to disambiguate topic, references, grammar pattern, and tricky English cases.
    - Do not return the primary answer or already accepted answers.
    - If a required answer prefix is present, every suggestion must start with it.
    - Do not invent answers that change the grammar target.
    - Keep variants short and teacher-review friendly.
    - If no safe variants exist, return an empty suggestions array.
    """.trimIndent()

private val materialAnswerSuggestionSystemPrompt = """
    You help English teachers prepare interactive exercises for children.
    Suggest only plausible additional correct answer variants.
    The teacher will review every suggestion before saving it.
""".trimIndent()

private val materialAnswerSuggestionSchemaJson = """
{
  "type": "object",
  "properties": {
    "suggestions": {
      "type": "array",
      "maxItems": 5,
      "items": {
        "type": "object",
        "properties": {
          "value": { "type": "string", "maxLength": 160 },
          "reason": { "type": "string", "maxLength": 240 },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        },
        "required": ["value", "reason", "confidence"],
        "additionalProperties": false
      }
    }
  },
  "required": ["suggestions"],
  "additionalProperties": false
}
""".trimIndent()

private fun pronounAnswerVariants(answer: String): List<String> {
    val lower = answer.lowercase()
    return buildList {
        if (Regex("\\bit\\b").containsMatchIn(lower)) {
            add(answer.replace(Regex("\\bit\\b", RegexOption.IGNORE_CASE), "that"))
            add(answer.replace(Regex("\\bit\\b", RegexOption.IGNORE_CASE), "this"))
        }
        if (Regex("\\bthat\\b").containsMatchIn(lower)) {
            add(answer.replace(Regex("\\bthat\\b", RegexOption.IGNORE_CASE), "it"))
            add(answer.replace(Regex("\\bthat\\b", RegexOption.IGNORE_CASE), "this"))
        }
    }
}

private fun gerundAnswerVariants(answer: String, prompt: String): List<String> {
    val lower = answer.lowercase()
    if (!lower.endsWith("ing")) {
        return emptyList()
    }
    return buildList {
        if (prompt.contains("on my own", ignoreCase = true)) {
            add("$answer alone")
        }
        add("$answer out")
    }
}

private fun shortAnswerVariants(answer: String, blockTitle: String, prompt: String): List<String> {
    val context = "$blockTitle $prompt".lowercase()
    if (!context.contains("correct") && !context.contains("mistake")) {
        return emptyList()
    }
    return when (answer.lowercase()) {
        "will she do" -> listOf("is she going to do")
        "might take" -> listOf("may take", "could take")
        "about it" -> listOf("about this", "about that")
        else -> emptyList()
    }
}

private fun normalizedAnswerSuggestionValue(value: String): String =
    value.trim().lowercase().replace(Regex("[\\p{Punct}]+"), "").replace(Regex("\\s+"), " ")

private fun answerSuggestionMatchesPrefix(value: String, hintPrefix: String): Boolean {
    val cleanPrefix = hintPrefix.trim().lowercase()
    if (cleanPrefix.isEmpty()) {
        return true
    }
    return value.trim().lowercase().startsWith(cleanPrefix)
}
