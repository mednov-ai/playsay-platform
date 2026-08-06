package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

data class MaterialHtmlGameAiInput(
    val candidateTitle: String,
    val titleNeedsAi: Boolean,
    val context: String,
)

data class MaterialHtmlGameAiResult(
    val title: String,
    val titleSource: String,
    val iconPrompt: String,
)

@Component
class MaterialHtmlGameAiService(
    @param:Value("\${playsay.ai.provider:stub}") private val provider: String,
    private val transport: OpenAiResponsesTransport,
    @param:Value("\${playsay.ai.openai.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.ai.openai.model:gpt-5.4-mini}") private val model: String,
    @param:Value("\${playsay.ai.openai.base-url:https://api.openai.com/v1}") private val baseUrl: String,
    @param:Value("\${playsay.ai.openai.reasoning.html-game-metadata:medium}") reasoningEffort: String = "medium",
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()
    private val reasoningEffort = validatedOpenAiReasoningEffort(reasoningEffort, "medium")

    fun analyze(input: MaterialHtmlGameAiInput): MaterialHtmlGameAiResult =
        when (provider.trim().lowercase()) {
            "", "stub" -> stubResult(input)
            "openai" -> openAiResult(input)
            else -> throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.AI_PROVIDER_UNKNOWN)
        }

    private fun stubResult(input: MaterialHtmlGameAiInput): MaterialHtmlGameAiResult =
        MaterialHtmlGameAiResult(
            title = if (input.titleNeedsAi) MaterialHtmlGameTitlePolicy.FALLBACK_TITLE else input.candidateTitle.take(160),
            titleSource = if (input.titleNeedsAi) "AI" else "HTML",
            iconPrompt = gameIconPrompt(input.candidateTitle, input.context),
        )

    private fun openAiResult(input: MaterialHtmlGameAiInput): MaterialHtmlGameAiResult {
        val cleanApiKey = apiKey.trim()
        if (cleanApiKey.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.AI_API_KEY_NOT_CONFIGURED)
        }
        val request = objectMapper.createObjectNode().apply {
            put("model", model.trim().ifEmpty { "gpt-5.4-mini" })
            put("max_output_tokens", 600)
            set<JsonNode>("reasoning", objectMapper.createObjectNode().put("effort", reasoningEffort))
            putArray("input")
                .add(message("system", htmlGameSystemPrompt))
                .add(message("user", htmlGameUserPrompt(input)))
            set<JsonNode>("text", objectMapper.createObjectNode().apply {
                set<JsonNode>("format", objectMapper.createObjectNode().apply {
                    put("type", "json_schema")
                    put("name", "playsay_html_game_metadata")
                    put("strict", true)
                    set<JsonNode>("schema", responseSchema())
                })
            })
        }
        val raw = try {
            transport.createResponse(baseUrl.trim().ifEmpty { "https://api.openai.com/v1" }, cleanApiKey, objectMapper.writeValueAsString(request))
        } catch (exception: Exception) {
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.AI_MATERIAL_GENERATION_FAILED)
        }
        val response = runCatching { objectMapper.readTree(raw) }.getOrNull()
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.AI_RESPONSE_INVALID_JSON)
        val output = response.path("output").flatMap { item -> item.path("content").toList() }
            .firstOrNull { content -> content.path("type").asText() == "output_text" || content.hasNonNull("text") }
            ?.path("text")?.asText()
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.AI_MATERIAL_RESPONSE_MISSING)
        val result = runCatching { objectMapper.readTree(output) }.getOrNull()
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.AI_RESPONSE_INVALID_JSON)
        val aiTitle = result.path("title").asText().trim().take(160)
        if (input.titleNeedsAi && !MaterialHtmlGameTitlePolicy.isEnglish(aiTitle)) {
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.AI_HTML_GAME_TITLE_INVALID)
        }
        val title = if (input.titleNeedsAi) aiTitle else input.candidateTitle
        return MaterialHtmlGameAiResult(
            title = title,
            titleSource = if (input.titleNeedsAi) "AI" else "HTML",
            iconPrompt = result.path("iconPrompt").asText().trim().take(1_200).ifBlank { gameIconPrompt(title, input.context) },
        )
    }

    private fun message(role: String, text: String): ObjectNode = objectMapper.createObjectNode().apply {
        put("role", role)
        putArray("content").add(objectMapper.createObjectNode().apply { put("type", "input_text"); put("text", text) })
    }

    private fun responseSchema(): ObjectNode = objectMapper.createObjectNode().apply {
        put("type", "object")
        putArray("required").add("title").add("iconPrompt")
        put("additionalProperties", false)
        set<JsonNode>("properties", objectMapper.createObjectNode().apply {
            set<JsonNode>("title", objectMapper.createObjectNode().apply { put("type", "string"); put("maxLength", 160) })
            set<JsonNode>("iconPrompt", objectMapper.createObjectNode().apply { put("type", "string"); put("maxLength", 1200) })
        })
    }
}

private const val htmlGameSystemPrompt = """You identify educational browser games and design app icons. Return a concise English game title and a visual prompt for a square icon. Preserve a clear supplied English title. Translate or improve a non-English, generic, or technical title into natural English. The title must contain Latin letters and no letters from other scripts. Do not put words, letters, logos, UI screenshots, or text inside the icon."""

private fun htmlGameUserPrompt(input: MaterialHtmlGameAiInput): String = """
Candidate title: ${input.candidateTitle}
Candidate needs improvement: ${input.titleNeedsAi}
Extracted visible game context:
${input.context.take(8_000)}
""".trimIndent()

private fun gameIconPrompt(title: String, context: String): String =
    "Square friendly educational app icon for the game '$title'. ${context.take(500)}. Warm Honey School palette with orange accent, simple central symbol, soft cream background, no text, no letters, no logo, no screenshot."
