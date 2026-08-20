package com.playsay.gateway.service.material.scoring

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ArrayNode
import java.math.BigDecimal

internal fun JsonNode.acceptedAnswers(): List<String> =
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

internal fun JsonNode.materialItemKey(index: Int): String {
    val id = get("id")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
    if (id != null) {
        return id
    }
    val prompt = get("prompt")?.asText()?.trim().orEmpty()
    return "$prompt-$index"
}


internal fun materialAnswerValidation(block: JsonNode, item: JsonNode): AnswerValidationPolicy {
    val blockValidation = block.get("answerValidation")?.takeIf { node -> node.isObject }
    val itemValidation = item.get("answerValidation")?.takeIf { node -> node.isObject }
    fun boolean(name: String, default: Boolean): Boolean =
        itemValidation?.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: blockValidation?.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: default

    return AnswerValidationPolicy(
        ignoreCase = boolean("ignoreCase", true),
        ignorePunctuation = boolean("ignorePunctuation", true),
        ignoreWhitespace = boolean("ignoreWhitespace", true),
    )
}

internal fun answerAttemptValues(answerBlock: JsonNode?, itemKey: String, actual: String?, actualOptionId: String? = null): List<AnswerAttempt> {
    val attemptsNode = answerBlock?.get("attempts")?.get(itemKey)
    val attempts = when {
        attemptsNode is ArrayNode -> attemptsNode.mapNotNull { node ->
            val value = when {
                node.isTextual -> node.asText()
                node.isObject -> node.get("value")?.asText()
                else -> null
            }?.trim()?.takeIf { item -> item.isNotEmpty() } ?: return@mapNotNull null
            AnswerAttempt(
                value = value,
                optionId = node.takeIf { item -> item.isObject }
                    ?.get("optionId")
                    ?.asText()
                    ?.trim()
                    ?.takeIf { item -> item.isNotEmpty() },
            )
        }
        attemptsNode?.isTextual == true -> listOfNotNull(
            attemptsNode.asText().trim().takeIf { value -> value.isNotEmpty() }?.let { value -> AnswerAttempt(value, null) },
        )
        else -> emptyList()
    }
    return attempts.ifEmpty {
        listOfNotNull(actual?.trim()?.takeIf { value -> value.isNotEmpty() }?.let { value -> AnswerAttempt(value, actualOptionId) })
    }
}

internal fun matchingIncorrectAttempts(answerBlock: JsonNode?, matches: JsonNode?, pairs: ArrayNode): Int =
    pairs.sumOf { pair ->
        val expectedPairId = pair.get("id")?.asText()?.takeIf { value -> value.isNotBlank() } ?: return@sumOf 0
        answerAttemptValues(answerBlock, expectedPairId, matches?.get(expectedPairId)?.asText())
            .count { attempt -> attempt.value != expectedPairId }
    }

internal fun answerHints(answerBlock: JsonNode?, itemKey: String, policy: AssessmentPolicy): List<UsedHint> {
    val hintsNode = answerBlock?.get("hints")?.get(itemKey) ?: return emptyList()
    if (hintsNode !is ArrayNode) {
        return emptyList()
    }
    return hintsNode.mapNotNull { node ->
        when {
            node.isTextual -> UsedHint(type = node.asText().ifBlank { "hint" }, penalty = policy.defaultHintPenalty)
            node.isObject -> {
                val type = node.get("type")?.asText()?.ifBlank { "hint" } ?: "hint"
                val penalty = node.decimalField("penalty")
                    ?: node.decimalField("scorePenalty")
                    ?: policy.defaultHintPenalty
                UsedHint(type = type, penalty = penalty.between(BigDecimal.ZERO, BigDecimal.ONE))
            }
            else -> null
        }
    }
}

internal fun answerTeacherOverride(answerBlock: JsonNode?, itemKey: String): TeacherOverride? {
    val overrideNode = answerBlock?.get("teacherOverride")?.get(itemKey)
        ?: answerBlock?.get("overrides")?.get(itemKey)
        ?: return null
    if (!overrideNode.isObject) {
        return null
    }
    val correct = overrideNode.get("correct")?.takeIf { node -> node.isBoolean }?.asBoolean() ?: return null
    val scoreFactor = overrideNode.decimalField("scoreFactor")?.between(BigDecimal.ZERO, BigDecimal.ONE)
    return TeacherOverride(correct = correct, scoreFactor = scoreFactor)
}

internal fun answersMatch(actual: String?, expected: String, validation: AnswerValidationPolicy): Boolean =
    normalizedAssessmentAnswer(actual, validation) == normalizedAssessmentAnswer(expected, validation)

internal fun normalizedAssessmentAnswer(value: String?, validation: AnswerValidationPolicy): String {
    var normalized = value?.trim() ?: ""
    if (validation.ignoreCase) {
        normalized = normalized.lowercase()
    }
    if (validation.ignorePunctuation) {
        normalized = normalized.replace(Regex("[\\p{Punct}]+"), "")
    }
    if (validation.ignoreWhitespace) {
        normalized = normalized.replace(Regex("\\s+"), " ")
    }
    return normalized.trim()
}
