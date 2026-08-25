package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ArrayNode
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

@Component
class WorksheetMaterialDocumentValidator {
    fun validate(document: JsonNode) {
        when (document.path("schemaVersion").asInt(-1)) {
            1 -> return
            2 -> validateV2(document)
            else -> invalid()
        }
    }

    private fun validateV2(document: JsonNode) {
        val pages = document.get("pages") as? ArrayNode ?: invalid()
        if (pages.isEmpty || pages.size() > 200) invalid()
        unique(pages.map { it.requiredText("id") })
        pages.forEach { page ->
            val layout = page.requiredText("layout")
            val blocks = page.get("blocks") as? ArrayNode ?: invalid()
            if (layout == "WORKSHEET") {
                if (blocks.size() != 1 || blocks[0].path("type").asText() != "interactiveWorksheet") invalid()
                validateWorksheet(blocks[0])
            } else if (layout !in setOf("FLOW", "STATIC_IMAGE", "HTML_GAME")) invalid()
        }
    }

    private fun validateWorksheet(block: JsonNode) {
        block.requiredText("id")
        if (!block.requiredText("sourceAsset").matches(MATERIAL_ASSET_REFERENCE)) invalid()
        if (block.path("intrinsicWidth").asInt() <= 0 || block.path("intrinsicHeight").asInt() <= 0) invalid()
        val groups = block.get("groups") as? ArrayNode ?: invalid()
        unique(groups.map { it.requiredText("id") })
        if (groups.map { it.path("order").asInt(-1) } != (0 until groups.size()).toList()) invalid()
        groups.forEach { group ->
            when (group.requiredText("type")) {
                "FILL_GAPS" -> validateGaps(group)
                "MATCHING_PAIRS" -> validatePairs(group)
                "MULTIPLE_CHOICE" -> validateChoices(group)
                "FLASHCARDS" -> validateCards(group)
                else -> invalid()
            }
        }
    }

    private fun validateGaps(group: JsonNode) {
        val mode = group.requiredText("gapMode")
        if (mode !in setOf("TYPED", "SINGLE_CHOICE", "WORD_BANK", "FORM_TRANSFORM")) invalid()
        val gaps = group.nonEmptyArray("gaps", 200)
        unique(gaps.map { it.requiredText("id") })
        gaps.forEach { gap -> validateGap(gap, mode) }
        if (mode == "WORD_BANK") {
            val bank = group.nonEmptyTextArray("wordBank", 300)
            unique(bank)
            val answers = gaps.flatMap { it.nonEmptyTextArray("acceptedAnswers", 20) }
            if (!bank.containsAll(answers)) invalid()
        }
    }

    private fun validateGap(gap: JsonNode, mode: String) {
        region(gap.path("region"))
        val answers = gap.nonEmptyTextArray("acceptedAnswers", 20)
        if (mode == "FORM_TRANSFORM" && gap.path("baseForm").asText().isBlank()) invalid()
        if (mode == "SINGLE_CHOICE") {
            val options = gap.nonEmptyTextArray("options", 50)
            if (options.size < 2 || options.none(answers::contains)) invalid()
            unique(options)
        }
        val distractors = gap.path("distractors") as? ArrayNode ?: invalid()
        distractors.forEach { distractor ->
            if (distractor.path("value").asText().isBlank()) invalid()
            confidence(distractor.path("confidence"))
        }
    }

    private fun validatePairs(group: JsonNode) {
        val pairs = group.nonEmptyArray("pairs", 100)
        unique(pairs.map { it.requiredText("id") })
        unique(pairs.map { it.path("number").asText() })
        pairs.forEach { pair ->
            if (pair.path("number").asInt() <= 0) invalid()
            listOf(pair.path("left"), pair.path("right")).forEach { endpoint ->
                region(endpoint.path("region"))
                when (endpoint.requiredText("kind")) {
                    "TEXT" -> if (endpoint.path("text").asText().isBlank()) invalid()
                    "IMAGE" -> Unit
                    else -> invalid()
                }
            }
        }
    }

    private fun validateChoices(group: JsonNode) {
        val questions = group.nonEmptyArray("questions", 100)
        unique(questions.map { it.requiredText("id") })
        questions.forEach { question ->
            question.requiredText("prompt")
            question.get("promptRegion")?.takeUnless(JsonNode::isNull)?.let(::region)
            val options = question.nonEmptyArray("options", 20)
            if (options.size() < 2) invalid()
            unique(options.map { it.requiredText("id") })
            if (options.map { it.path("order").asInt(-1) } != (0 until options.size()).toList()) invalid()
            options.forEach { option ->
                option.requiredText("text")
                option.get("region")?.takeUnless(JsonNode::isNull)?.let(::region)
                confidence(option.path("confidence"))
            }
            val correct = question.nonEmptyTextArray("correctOptionIds", 20).toSet()
            if (!options.map { it.path("id").asText() }.containsAll(correct)) invalid()
        }
    }

    private fun validateCards(group: JsonNode) {
        val cards = group.nonEmptyArray("cards", 100)
        unique(cards.map { it.requiredText("id") })
        if (cards.map { it.path("order").asInt(-1) } != (0 until cards.size()).toList()) invalid()
        cards.forEach { card -> listOf(card.path("front"), card.path("back")).forEach { side ->
            when (side.requiredText("kind")) {
                "TEXT" -> side.requiredText("text")
                "IMAGE" -> region(side.path("region"))
                else -> invalid()
            }
            confidence(side.path("confidence"))
        } }
    }

    private fun region(region: JsonNode) {
        val x = region.path("x").asInt(-1); val y = region.path("y").asInt(-1)
        val width = region.path("width").asInt(-1); val height = region.path("height").asInt(-1)
        if (x !in 0..999 || y !in 0..999 || width !in 1..1_000 || height !in 1..1_000 || x + width > 1_000 || y + height > 1_000) invalid()
    }

    private fun confidence(value: JsonNode) { if (!value.isNumber || value.asDouble() !in 0.0..1.0) invalid() }
    private fun JsonNode.requiredText(name: String): String = path(name).takeIf(JsonNode::isTextual)?.asText()?.takeIf(String::isNotBlank) ?: invalid()
    private fun JsonNode.nonEmptyArray(name: String, max: Int): ArrayNode = (get(name) as? ArrayNode)?.takeIf { !it.isEmpty && it.size() <= max } ?: invalid()
    private fun JsonNode.nonEmptyTextArray(name: String, max: Int): List<String> = nonEmptyArray(name, max).map { it.takeIf(JsonNode::isTextual)?.asText()?.takeIf(String::isNotBlank) ?: invalid() }
    private fun unique(values: List<String>) { if (values.distinct().size != values.size) invalid() }
    private fun invalid(): Nothing = throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID)

    private companion object { val MATERIAL_ASSET_REFERENCE = Regex("material-asset:[0-9a-fA-F-]{36}") }
}
