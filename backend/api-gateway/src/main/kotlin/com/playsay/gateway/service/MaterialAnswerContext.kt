package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode

internal data class MaterialAnswerItemContext(
    val itemId: String,
    val prompt: String,
    val answer: String?,
    val acceptedAnswers: List<String>,
    val options: List<String>,
    val hintPrefix: String,
    val itemContextPrompt: String,
    val blockContextPrompt: String,
)

internal fun materialAnswerItemContexts(block: ObjectNode): List<MaterialAnswerItemContext> {
    val items = block.get("items") as? ArrayNode ?: return emptyList()
    val rawItems = items.mapIndexed { index, item ->
        RawMaterialAnswerItemContext(
            itemId = item.materialItemKey(index),
            threadRootItemId = item.get("threadRootItemId")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() },
            prompt = item.get("prompt")?.asText()?.trim().orEmpty(),
            answer = item.get("answer")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                ?: item.get("correct")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() },
            acceptedAnswers = item.acceptedAnswers(),
            options = ((item.get("options") ?: item.get("choices")) as? ArrayNode)?.mapNotNull { option ->
                option.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
            } ?: emptyList(),
            hintPrefix = item.materialHintPrefix(),
        )
    }
    val itemIds = rawItems.map { item -> item.itemId }.toSet()
    val rows = rawItems.map { item ->
        item.copy(
            threadRootItemId = item.threadRootItemId
                ?.takeIf { rootItemId -> rootItemId != item.itemId && rootItemId in itemIds },
        )
    }
    val blockContextPrompt = rows
        .filter { item -> item.prompt.isNotBlank() || item.answer != null }
        .joinToString("\n") { item ->
            val prefix = if (item.threadRootItemId == null) "- " else "  continuation: "
            val answer = item.answer?.let { value -> " [answer: ${materialAnswerContextText(value)}]" }.orEmpty()
            "$prefix${materialAnswerContextText(item.prompt)}$answer".trim()
        }

    return rows.map { item ->
        val threadRootItemId = item.threadRootItemId ?: item.itemId
        val threadPrompt = rows
            .filter { candidate -> candidate.itemId == threadRootItemId || candidate.threadRootItemId == threadRootItemId }
            .map { candidate -> materialAnswerContextText(candidate.prompt) }
            .filter { prompt -> prompt.isNotBlank() }
            .joinToString(" ")
        MaterialAnswerItemContext(
            itemId = item.itemId,
            prompt = item.prompt,
            answer = item.answer,
            acceptedAnswers = item.acceptedAnswers,
            options = item.options,
            hintPrefix = item.hintPrefix,
            itemContextPrompt = threadPrompt.ifBlank { materialAnswerContextText(item.prompt) },
            blockContextPrompt = blockContextPrompt.ifBlank { materialAnswerContextText(item.prompt) },
        )
    }
}

internal fun findMaterialBlock(document: JsonNode, blockId: String): ObjectNode? {
    val pages = document.get("pages") as? ArrayNode ?: return null
    pages.forEach { page ->
        val blocks = page.get("blocks") as? ArrayNode ?: return@forEach
        blocks.forEach { block ->
            val blockObject = block as? ObjectNode ?: return@forEach
            if (blockObject.get("id")?.asText()?.trim() == blockId) {
                return blockObject
            }
        }
    }
    return null
}

private data class RawMaterialAnswerItemContext(
    val itemId: String,
    val threadRootItemId: String?,
    val prompt: String,
    val answer: String?,
    val acceptedAnswers: List<String>,
    val options: List<String>,
    val hintPrefix: String,
)

private fun JsonNode.acceptedAnswers(): List<String> =
    buildList {
        get("answer")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }?.let(::add)
        get("correct")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }?.let(::add)
        listOf("acceptedAnswers", "answers", "variants").forEach { field ->
            val values = get(field) as? ArrayNode ?: return@forEach
            values.forEach { value ->
                value.asText()?.trim()?.takeIf { item -> item.isNotEmpty() }?.let(::add)
            }
        }
    }.distinct()

private fun JsonNode.materialItemKey(index: Int): String {
    val id = get("id")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
    if (id != null) {
        return id
    }
    val prompt = get("prompt")?.asText()?.trim().orEmpty()
    return "$prompt-$index"
}

private fun JsonNode.materialHintPrefix(): String {
    val mode = get("gapMode")?.asText()?.trim().orEmpty()
    if (mode.isNotEmpty() && mode != "typed") {
        return ""
    }
    val length = get("hintPrefixLength")?.takeIf { node -> node.isNumber }?.asInt() ?: return ""
    if (length !in 1..2) {
        return ""
    }
    val answer = get("answer")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
        ?: get("correct")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
        ?: return ""
    return answer.take(length)
}

private fun materialAnswerContextText(value: String): String =
    value.trim().replace(Regex("\\s+"), " ")
