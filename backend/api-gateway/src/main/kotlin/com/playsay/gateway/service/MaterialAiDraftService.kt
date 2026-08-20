package com.playsay.gateway.service

import com.playsay.openai.validatedOpenAiReasoningEffort
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import com.playsay.gateway.dto.*
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.service.material.StubMaterialAiDraftProvider
import com.playsay.gateway.service.material.hasSourceImage
import com.playsay.gateway.service.material.resolvedSourceType
import com.playsay.gateway.service.material.MaterialAiDraftValidator
import com.playsay.gateway.service.material.MaterialAiPromptBuilder
import com.playsay.gateway.service.material.MaterialDraftSchema
import com.playsay.gateway.service.material.OpenAiResponsesTransport
import com.playsay.gateway.service.material.OpenAiTransportException

data class MaterialAiDraftInput(
    val title: String,
    val prompt: String,
    val language: String,
    val cefrLevel: String,
    val sourceImageDataUrl: String? = null,
    val sourceFileName: String? = null,
    val sourceType: String? = null,
    val sourceUrl: String? = null,
    val sourceTitle: String? = null,
    val sourceFetchedChars: Int? = null,
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
            else -> throw ProjectResponseException.localized(
                HttpStatus.SERVICE_UNAVAILABLE,
                MetaData.ErrorCodes.AI_PROVIDER_UNKNOWN,
            )
        }
}

@Component
class OpenAiMaterialAiDraftProvider(
    private val transport: OpenAiResponsesTransport,
    @param:Value("\${playsay.ai.openai.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.ai.openai.model:gpt-5.4-mini}") private val model: String,
    @param:Value("\${playsay.ai.openai.base-url:https://api.openai.com/v1}") private val baseUrl: String,
    @param:Value("\${playsay.ai.openai.reasoning.material-draft:medium}") reasoningEffort: String = "medium",
    private val promptBuilder: MaterialAiPromptBuilder = MaterialAiPromptBuilder(),
    private val schema: MaterialDraftSchema = MaterialDraftSchema(),
    private val validator: MaterialAiDraftValidator = MaterialAiDraftValidator(schema),
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()
    private val reasoningEffort = validatedOpenAiReasoningEffort(reasoningEffort, "medium")

    fun draft(input: MaterialAiDraftInput): LessonMaterialDraftResponse {
        val cleanApiKey = apiKey.trim()
        val cleanModel = model.trim().ifEmpty { "gpt-5.4-mini" }
        val cleanBaseUrl = baseUrl.trim().ifEmpty { "https://api.openai.com/v1" }
        if (cleanApiKey.isEmpty()) {
            throw ProjectResponseException.localized(
                HttpStatus.SERVICE_UNAVAILABLE,
                MetaData.ErrorCodes.AI_API_KEY_NOT_CONFIGURED,
            )
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
            throw ProjectResponseException.localized(
                status,
                MetaData.ErrorCodes.AI_MATERIAL_GENERATION_FAILED,
            )
        } catch (exception: Exception) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_GATEWAY,
                MetaData.ErrorCodes.AI_MATERIAL_GENERATION_FAILED,
            )
        }

        val responseNode = parseJson(rawResponse)
        val outputText = responseNode.outputText()
            ?: throw ProjectResponseException.localized(
                HttpStatus.BAD_GATEWAY,
                MetaData.ErrorCodes.AI_MATERIAL_RESPONSE_MISSING,
            )
        val draftNode = parseJson(outputText)
        val draft = validator.parseAndValidate(draftNode)
        return draft.withOpenAiSourceMeta(objectMapper, input, cleanModel, reasoningEffort)
    }

    private fun openAiRequest(input: MaterialAiDraftInput, cleanModel: String): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("model", cleanModel)
            put("max_output_tokens", 8_000)
            set<JsonNode>("reasoning", objectMapper.createObjectNode().put("effort", reasoningEffort))
            putArray("input")
                .add(openAiMessage("system", promptBuilder.systemPrompt()))
                .add(openAiMessage("user", promptBuilder.userPrompt(input), input.sourceImageDataUrl))
            set<JsonNode>(
                "text",
                objectMapper.createObjectNode().apply {
                    set<JsonNode>(
                        "format",
                        objectMapper.createObjectNode().apply {
                            put("type", "json_schema")
                            put("name", "playsay_lesson_material_draft")
                            set<JsonNode>("schema", schema.node)
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
            .getOrElse {
                throw ProjectResponseException.localized(
                    HttpStatus.BAD_GATEWAY,
                    MetaData.ErrorCodes.AI_RESPONSE_INVALID_JSON,
                )
            }

}

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
    reasoningEffort: String,
): LessonMaterialDraftResponse {
    val meta = if (sourceMeta is ObjectNode) sourceMeta.deepCopy<ObjectNode>() else objectMapper.createObjectNode()
    meta.put("kind", "AI_GENERATED")
    meta.put("provider", "openai")
    meta.put("model", model)
    meta.put("reasoningEffort", reasoningEffort)
    meta.put("prompt", input.prompt)
    meta.put("sourceType", input.resolvedSourceType())
    meta.put("requestedTitle", input.title)
    meta.put("requestedLanguage", input.language)
    meta.put("requestedCefrLevel", input.cefrLevel)
    input.sourceFileName?.let { fileName -> meta.put("sourceFileName", fileName) }
    input.sourceUrl?.let { url -> meta.put("sourceUrl", url) }
    input.sourceTitle?.let { title -> meta.put("sourceTitle", title) }
    input.sourceFetchedChars?.let { chars -> meta.put("sourceFetchedChars", chars) }

    return copy(
        title = title.trim().ifEmpty { input.title }.take(160),
        description = description?.trim()?.take(2_000),
        language = language.trim().ifEmpty { input.language }.take(16),
        cefrLevel = cefrLevel.trim().uppercase().takeIf { level -> level in setOf("A1", "A2", "B1", "B2", "C1", "C2") }
            ?: input.cefrLevel,
        visibility = "PRIVATE",
        status = "DRAFT",
        sourceMeta = meta,
    )
}
