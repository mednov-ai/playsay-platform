package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.TranslationSuggestionResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient

@Service
class OpenAiTranslationProvider(
    builder: RestClient.Builder,
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.vocabulary.translation.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.vocabulary.translation.base-url:https://api.openai.com/v1}") baseUrl: String,
    @param:Value("\${playsay.vocabulary.translation.model:gpt-5-mini}") private val model: String,
) : TranslationProvider {
    private val client = builder.baseUrl(baseUrl).build()

    override fun suggest(sourceText: String, sourceLanguage: String, targetLanguage: String, context: String?): TranslationSuggestionResponse {
        if (apiKey.isBlank()) return TranslationSuggestionResponse("", null, null, null, "UNAVAILABLE")
        val prompt = "Create a concise learner dictionary card. Translate from $sourceLanguage to $targetLanguage. Text: $sourceText. Context: ${context.orEmpty()}"
        val schema = mapOf("type" to "object", "additionalProperties" to false, "properties" to mapOf(
            "translation" to mapOf("type" to "string"), "partOfSpeech" to mapOf("type" to listOf("string", "null")),
            "example" to mapOf("type" to listOf("string", "null")), "exampleTranslation" to mapOf("type" to listOf("string", "null"))),
            "required" to listOf("translation", "partOfSpeech", "example", "exampleTranslation"))
        val body = mapOf("model" to model, "store" to false, "input" to prompt, "text" to mapOf("format" to mapOf("type" to "json_schema", "name" to "vocabulary_card", "strict" to true, "schema" to schema)))
        val response = client.post().uri("/responses").contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer $apiKey")
            .body(body).retrieve().body(Map::class.java) ?: return TranslationSuggestionResponse("", null, null, null, "UNAVAILABLE")
        val output = response["output"] as? List<*> ?: emptyList<Any>()
        val content = (output.firstOrNull() as? Map<*, *>)?.get("content") as? List<*>
        val text = (content?.firstOrNull() as? Map<*, *>)?.get("text") as? String ?: return TranslationSuggestionResponse("", null, null, null, "UNAVAILABLE")
        val json = objectMapper.readTree(text)
        return TranslationSuggestionResponse(json.path("translation").asText(), json.path("partOfSpeech").textOrNull(), json.path("example").textOrNull(), json.path("exampleTranslation").textOrNull(), "OPENAI")
    }
}

private fun com.fasterxml.jackson.databind.JsonNode.textOrNull(): String? = takeUnless { it.isNull || it.isMissingNode }?.asText()?.takeIf { it.isNotBlank() }
