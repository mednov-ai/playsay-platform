package com.playsay.gateway.service.material.scoring

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ArrayNode
import java.math.BigDecimal

internal const val fillGapDefaultMaxAttempts = 5
internal const val fillGapDefaultMaxErrors = 3

internal fun materialAssessmentPolicy(block: JsonNode, item: JsonNode, blockType: String): AssessmentPolicy {
    val source = AssessmentSources(block, item)
    val configuredAttempts = configuredMaxAttempts(source, blockType)
    val maxAttempts = if (blockType == "matchingPairs") {
        val pairCount = (block["pairs"] as? ArrayNode)?.size() ?: configuredAttempts
        configuredAttempts.coerceIn(1, 10).coerceAtMost(pairCount.coerceAtLeast(1))
    } else {
        configuredAttempts.coerceIn(1, 10)
    }
    return AssessmentPolicy(
        weight = if (blockType == "fillGaps") BigDecimal.ONE
            else source.decimal("weight", BigDecimal.ONE).between(BigDecimal("0.10"), BigDecimal("20")),
        maxAttempts = maxAttempts,
        attemptPenalty = penalty(source, blockType, "attemptPenalty", "0.30"),
        minimumCorrectFactor = source.decimal("minimumCorrectFactor", BigDecimal("0.40"))
            .between(BigDecimal.ZERO, BigDecimal.ONE),
        defaultHintPenalty = penalty(source, blockType, "hintPenalty", "0.15"),
        minimumHintFactor = source.decimal("minimumHintFactor", BigDecimal("0.40"))
            .between(BigDecimal.ZERO, BigDecimal.ONE),
        lockAfterAttempts = source.boolean("lockAfterAttempts", true),
    )
}

private fun configuredMaxAttempts(source: AssessmentSources, blockType: String): Int = when (blockType) {
    "matchingPairs" -> source.blockInt("maxErrors") ?: source.blockInt("maxAttempts") ?: 5
    "fillGaps" -> fillGapMaxAttempts(source)
    else -> source.int("maxAttempts", 3)
}

private fun fillGapMaxAttempts(source: AssessmentSources): Int {
    val mode = source.item["gapMode"]?.asText()?.takeIf(String::isNotBlank)
        ?: if ((source.item["options"] as? ArrayNode)?.isEmpty == false) "singleChoice" else "typed"
    return when (mode) {
        "singleChoice" -> (source.item["options"] as? ArrayNode)?.size()?.takeIf { it > 0 } ?: 1
        "wordBank" -> source.itemInt("maxErrors")
            ?: source.itemInt("maxAttempts")
            ?: source.blockInt("maxErrors")
            ?: source.blockInt("maxAttempts")
            ?: fillGapDefaultMaxErrors
        else -> source.itemInt("maxAttempts")
            ?: source.blockInt("maxAttempts")
            ?: fillGapDefaultMaxAttempts
    }
}

private fun penalty(source: AssessmentSources, blockType: String, name: String, default: String): BigDecimal =
    if (blockType == "fillGaps") BigDecimal(default)
    else source.decimal(name, BigDecimal(default)).between(BigDecimal.ZERO, BigDecimal.ONE)

private class AssessmentSources(
    val block: JsonNode,
    val item: JsonNode,
) {
    private val blockAssessment = block["assessment"]?.takeIf(JsonNode::isObject)
    private val itemAssessment = item["assessment"]?.takeIf(JsonNode::isObject)

    fun decimal(name: String, default: BigDecimal): BigDecimal =
        itemAssessment?.decimalField(name) ?: item.decimalField(name)
            ?: blockAssessment?.decimalField(name) ?: block.decimalField(name) ?: default

    fun int(name: String, default: Int): Int = itemInt(name) ?: blockInt(name) ?: default

    fun boolean(name: String, default: Boolean): Boolean =
        itemAssessment?.get(name)?.takeIf(JsonNode::isBoolean)?.asBoolean()
            ?: item[name]?.takeIf(JsonNode::isBoolean)?.asBoolean()
            ?: blockAssessment?.get(name)?.takeIf(JsonNode::isBoolean)?.asBoolean()
            ?: block[name]?.takeIf(JsonNode::isBoolean)?.asBoolean()
            ?: default

    fun itemInt(name: String): Int? = item[name].asIntValue() ?: itemAssessment?.get(name).asIntValue()

    fun blockInt(name: String): Int? = blockAssessment?.get(name).asIntValue() ?: block[name].asIntValue()
}

private fun JsonNode?.asIntValue(): Int? = when {
    this == null -> null
    isInt || isLong -> asInt()
    isTextual -> asText().trim().toIntOrNull()
    else -> null
}


internal fun JsonNode.decimalField(name: String): BigDecimal? {
    val node = get(name) ?: return null
    return when {
        node.isNumber -> node.decimalValue()
        node.isTextual -> node.asText().trim().takeIf { value -> value.isNotEmpty() }?.let { value ->
            runCatching { BigDecimal(value) }.getOrNull()
        }
        else -> null
    }
}

internal fun JsonNode.intField(name: String): Int? {
    val node = get(name) ?: return null
    return when {
        node.isInt || node.isLong -> node.asInt()
        node.isTextual -> node.asText().trim().toIntOrNull()
        else -> null
    }
}

internal fun BigDecimal.between(min: BigDecimal, max: BigDecimal): BigDecimal =
    this.max(min).min(max)
