package com.playsay.gateway.service.material

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.LessonMaterialDraftResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

@Component
class MaterialAiDraftValidator(
    private val schema: MaterialDraftSchema = MaterialDraftSchema(),
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    fun parseAndValidate(draftNode: JsonNode): LessonMaterialDraftResponse {
        if (schema.validationErrors(draftNode).isNotEmpty()) invalid(MetaData.ErrorCodes.AI_MATERIAL_SCHEMA_INVALID)
        val mapped = runCatching { objectMapper.treeToValue(draftNode, LessonMaterialDraftResponse::class.java) }
            .getOrElse { invalid(MetaData.ErrorCodes.AI_MATERIAL_SCHEMA_INVALID) }
        val draft = mapped.copy(document = ArticleAnswerNormalizer.normalize(draftNode = mapped.document))
        validateDomainRules(draft)
        return draft
    }

    private fun validateDomainRules(draft: LessonMaterialDraftResponse) {
        if (draft.title.isBlank() || draft.title.length > 160) invalid(MetaData.ErrorCodes.AI_GENERATED_MATERIAL_TITLE_INVALID)
        if (draft.language.isBlank() || draft.language.length > 16 || draft.cefrLevel !in CEFR_LEVELS) {
            invalid(MetaData.ErrorCodes.AI_GENERATED_MATERIAL_METADATA_INVALID)
        }
        if (draft.document["schemaVersion"]?.asInt() != 1 || draft.document["pages"] !is ArrayNode) {
            invalid(MetaData.ErrorCodes.AI_GENERATED_MATERIAL_DOCUMENT_INVALID)
        }
        if (draft.scoringRubric["maxScore"]?.asInt() != 10) invalid(MetaData.ErrorCodes.AI_GENERATED_MATERIAL_RUBRIC_INVALID)
        (draft.document["pages"] as ArrayNode).forEach { page ->
            val blocks = page["blocks"] as? ArrayNode ?: invalid(MetaData.ErrorCodes.AI_GENERATED_MATERIAL_PAGE_EMPTY)
            blocks.forEach { block ->
                val type = block["type"]?.asText()
                if (type !in BLOCK_TYPES) invalid(MetaData.ErrorCodes.AI_GENERATED_MATERIAL_BLOCK_UNSUPPORTED)
                if (!block.validFor(type)) invalid(MetaData.ErrorCodes.AI_MATERIAL_SCHEMA_INVALID)
            }
        }
    }

    private fun JsonNode.validFor(type: String?): Boolean = when (type) {
        "text" -> this["body"]?.isTextual == true
        "flashcards" -> this["cards"].nonEmptyArray()
        "fillGaps", "multipleChoice" -> this["items"].nonEmptyArray()
        "matchingPairs" -> this["pairs"].nonEmptyArray()
        "freeWriting", "speakingPrompt" -> this["prompt"]?.isTextual == true
        "drawingArea" -> this["height"]?.takeIf(JsonNode::isInt)?.asInt() in 120..800
        "videoEmbed", "image", "generatedImage" -> true
        else -> false
    }

    private fun JsonNode?.nonEmptyArray(): Boolean = this?.isArray == true && size() > 0

    private fun invalid(code: String): Nothing =
        throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, code)

    private companion object {
        val CEFR_LEVELS = setOf("A1", "A2", "B1", "B2", "C1", "C2")
        val BLOCK_TYPES = setOf(
            "text", "videoEmbed", "image", "generatedImage", "flashcards", "fillGaps",
            "multipleChoice", "matchingPairs", "freeWriting", "speakingPrompt", "drawingArea",
        )
    }
}

private object ArticleAnswerNormalizer {
    fun normalize(draftNode: JsonNode): JsonNode {
        val normalized = draftNode.deepCopy<JsonNode>()
        val pages = normalized["pages"] as? ArrayNode ?: return normalized
        pages.forEach { page ->
            (page["blocks"] as? ArrayNode)?.forEach { block ->
                (block["items"] as? ArrayNode)?.forEach { item -> normalizeItem(item as? ObjectNode ?: return@forEach) }
            }
        }
        return normalized
    }

    private fun normalizeItem(item: ObjectNode) {
        val choices = item["choices"] as? ArrayNode ?: return
        if (!choices.map { it.asText().trim().lowercase() }.toSet().containsAll(setOf("a", "an", "-"))) return
        val answer = solve(item["prompt"]?.asText() ?: return) ?: return
        item.put("answer", answer); item.put("correct", answer)
    }

    private fun solve(prompt: String): String? {
        val tail = BLANK.find(prompt)?.groupValues?.get(1)?.trim() ?: return null
        val words = WORD.findAll(tail).map { it.value.lowercase() }.toList()
        val first = words.firstOrNull() ?: return "-"
        if (first in NO_ARTICLE || first in NUMBERS || (words.size == 1 && first in ADJECTIVES)) return "-"
        if (first in PLURALS || (first.endsWith("s") && first !in SINGULAR_S && !first.endsWith("ss"))) return "-"
        return if (first.firstOrNull() in VOWELS || first in SILENT_H) "an" else "a"
    }

    private val BLANK = Regex("""(?:___|__|…|\.{3})\s*([^.,;:!?]*)""")
    private val WORD = Regex("""[A-Za-z]+(?:-[A-Za-z]+)?""")
    private val VOWELS = setOf('a', 'e', 'i', 'o', 'u')
    private val ADJECTIVES = setOf("bad", "big", "blue", "funny", "good", "red", "small", "white", "yellow")
    private val NO_ARTICLE = setOf("bread", "cheese", "homework", "information", "jeans", "juice", "milk", "money", "music", "rice", "tea", "water")
    private val NUMBERS = setOf("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten")
    private val PLURALS = setOf("children", "people")
    private val SINGULAR_S = setOf("bus", "class", "dress", "glass")
    private val SILENT_H = setOf("heir", "honest", "honour", "honor", "hour")
}
