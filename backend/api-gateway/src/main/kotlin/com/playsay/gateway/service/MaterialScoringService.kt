package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import java.math.BigDecimal
import java.math.RoundingMode
import org.springframework.stereotype.Component

data class MaterialScoringResult(
    val score: BigDecimal,
    val errorsCount: Int,
    val content: JsonNode,
)

private const val fillGapDefaultMaxAttempts = 5
private const val fillGapDefaultMaxErrors = 3

@Component
class MaterialScoringService(
    private val objectMapper: ObjectMapper,
) {
    fun maxScore(scoringRubric: String): BigDecimal? =
        runCatching {
            val node = objectMapper.readTree(scoringRubric)
            node.get("maxScore")?.takeIf { value -> value.isNumber }?.decimalValue()
        }.getOrNull()

    fun score(documentJson: String, scoringRubric: String, content: JsonNode): MaterialScoringResult? {
        val document = runCatching { objectMapper.readTree(documentJson) }.getOrNull() ?: return null
        val answerRoot = content.get("answers")?.takeIf { node -> node.isObject } ?: return null
        val pages = document.get("pages") as? ArrayNode ?: return null
        val assessedContent = (content as? ObjectNode)?.deepCopy() ?: objectMapper.createObjectNode().apply {
            set<JsonNode>("answers", answerRoot)
        }
        val itemResults = objectMapper.createArrayNode()
        var totalWeight = BigDecimal.ZERO
        var earnedWeight = BigDecimal.ZERO
        var errorsCount = 0

        pages.forEach { page ->
            val blocks = page.get("blocks") as? ArrayNode ?: return@forEach
            blocks.forEach { block ->
                val blockId = block.get("id")?.asText()?.takeIf { value -> value.isNotBlank() } ?: return@forEach
                val blockType = block.get("type")?.asText().orEmpty()
                val answerBlock = answerRoot.get(blockId)
                when (blockType) {
                    "fillGaps",
                    "multipleChoice",
                    -> scoreAnswerItems(block, blockId, blockType, answerBlock).forEach { result ->
                        totalWeight += result.weight
                        earnedWeight += result.earnedWeight
                        errorsCount += result.errorsCount
                        itemResults.add(result.toJson(objectMapper))
                    }
                    "matchingPairs" -> scoreMatchingPairs(block, blockId, answerBlock).forEach { result ->
                        totalWeight += result.weight
                        earnedWeight += result.earnedWeight
                        errorsCount += result.errorsCount
                        itemResults.add(result.toJson(objectMapper))
                    }
                }
            }
        }

        if (totalWeight.compareTo(BigDecimal.ZERO) == 0) {
            return null
        }

        val maxScore = maxScore(scoringRubric) ?: BigDecimal.TEN
        val score = maxScore
            .multiply(earnedWeight)
            .divide(totalWeight, 2, RoundingMode.HALF_UP)
        val assessment = objectMapper.createObjectNode().apply {
            put("schemaVersion", 1)
            put("maxScore", maxScore)
            put("score", score)
            put("errorsCount", errorsCount)
            put("totalWeight", totalWeight)
            put("earnedWeight", earnedWeight)
            set<ArrayNode>("items", itemResults)
        }
        assessedContent.set<ObjectNode>("assessment", assessment)

        return MaterialScoringResult(
            score = score,
            errorsCount = errorsCount,
            content = assessedContent,
        )
    }

    private fun scoreAnswerItems(
        block: JsonNode,
        blockId: String,
        blockType: String,
        answerBlock: JsonNode?,
    ): List<ObjectiveItemScore> {
        val answerItems = answerBlock?.get("items")?.takeIf { node -> node.isObject }
        val items = block.get("items") as? ArrayNode ?: return emptyList()
        return items.mapIndexedNotNull { index, item ->
            val expected = item.acceptedAnswers()
            if (expected.isEmpty()) {
                return@mapIndexedNotNull null
            }
            val prompt = item.get("prompt")?.asText().orEmpty()
            val key = item.materialItemKey(index)
            val legacyKey = "$prompt-$index"
            val answerKey = when {
                answerItems?.has(key) == true -> key
                answerItems?.has(legacyKey) == true -> legacyKey
                else -> key
            }
            scoreObjectiveItem(
                block = block,
                item = item,
                blockId = blockId,
                blockType = blockType,
                itemKey = answerKey,
                expectedAnswers = expected,
                actual = answerItems?.get(answerKey)?.asText(),
                answerBlock = answerBlock,
            )
        }
    }

    private fun scoreMatchingPairs(
        block: JsonNode,
        blockId: String,
        answerBlock: JsonNode?,
    ): List<ObjectiveItemScore> {
        val matches = answerBlock?.get("matches")?.takeIf { node -> node.isObject }
        val pairs = block.get("pairs") as? ArrayNode ?: return emptyList()
        val globalPolicy = materialAssessmentPolicy(block, pairs.firstOrNull() ?: block, "matchingPairs")
        val globallyLocked = globalPolicy.lockAfterAttempts &&
            matchingIncorrectAttempts(answerBlock, matches, pairs) >= globalPolicy.maxAttempts
        return pairs.mapNotNull { pair ->
            val expectedPairId = pair.get("id")?.asText()?.takeIf { value -> value.isNotBlank() }
                ?: return@mapNotNull null
            scoreObjectiveItem(
                block = block,
                item = pair,
                blockId = blockId,
                blockType = "matchingPairs",
                itemKey = expectedPairId,
                expectedAnswers = listOf(expectedPairId),
                actual = matches?.get(expectedPairId)?.asText(),
                answerBlock = answerBlock,
                forceLocked = globallyLocked,
            )
        }
    }

    private fun scoreObjectiveItem(
        block: JsonNode,
        item: JsonNode,
        blockId: String,
        blockType: String,
        itemKey: String,
        expectedAnswers: List<String>,
        actual: String?,
        answerBlock: JsonNode?,
        forceLocked: Boolean = false,
    ): ObjectiveItemScore {
        val policy = materialAssessmentPolicy(block, item, blockType)
        val validation = materialAnswerValidation(block, item)
        val override = answerTeacherOverride(answerBlock, itemKey)
        val expectedOptionId = item.get("answerOptionId")
            ?.asText()
            ?.trim()
            ?.takeIf { value -> value.isNotEmpty() && item.get("gapMode")?.asText() == "wordBank" }
        val actualOptionId = answerBlock?.get("optionIds")?.get(itemKey)?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
        val attempts = answerAttemptValues(answerBlock, itemKey, actual, actualOptionId)
        val hints = answerHints(answerBlock, itemKey, policy)
        val actualCorrect = if (expectedOptionId != null) {
            !actual.isNullOrBlank() && actualOptionId == expectedOptionId
        } else {
            expectedAnswers.any { expected -> answersMatch(actual, expected, validation) }
        }
        val correct = override?.correct ?: actualCorrect
        val incorrectAttempts = attempts.count { attempt ->
            if (expectedOptionId != null) {
                attempt.optionId != expectedOptionId
            } else {
                expectedAnswers.none { expected -> answersMatch(attempt.value, expected, validation) }
            }
        }
        val attemptsUsed = attempts.size.takeIf { count -> count > 0 } ?: if (actual.isNullOrBlank()) 0 else 1
        val attemptFactor = if (correct) {
            BigDecimal.ONE
                .subtract(policy.attemptPenalty.multiply(BigDecimal.valueOf((attemptsUsed - 1).coerceAtLeast(0).toLong())))
                .max(policy.minimumCorrectFactor)
        } else {
            BigDecimal.ZERO
        }
        val hintPenalty = hints.fold(BigDecimal.ZERO) { total, hint -> total + hint.penalty }
        val hintFactor = BigDecimal.ONE.subtract(hintPenalty).max(policy.minimumHintFactor)
        val overrideFactor = override?.scoreFactor
        val scoreFactor = if (!correct) {
            BigDecimal.ZERO
        } else {
            listOfNotNull(attemptFactor, hintFactor, overrideFactor).minOrNull() ?: BigDecimal.ONE
        }.between(BigDecimal.ZERO, BigDecimal.ONE)
        val earnedWeight = policy.weight.multiply(scoreFactor)
        val errorsCount = if (attempts.isNotEmpty()) {
            incorrectAttempts
        } else if (!correct) {
            1
        } else {
            0
        }

        return ObjectiveItemScore(
            blockId = blockId,
            blockType = blockType,
            itemKey = itemKey,
            correct = correct,
            actual = actual?.trim(),
            weight = policy.weight,
            earnedWeight = earnedWeight,
            scoreFactor = scoreFactor,
            maxAttempts = policy.maxAttempts,
            attemptsUsed = attemptsUsed,
            incorrectAttempts = incorrectAttempts,
            hintsUsed = hints.size,
            errorsCount = errorsCount,
            status = when {
                correct && hints.isEmpty() && attemptsUsed <= 1 -> "CORRECT"
                correct && hints.isNotEmpty() -> "CORRECT_WITH_HINT"
                correct -> "CORRECT_AFTER_RETRY"
                forceLocked && policy.lockAfterAttempts -> "LOCKED"
                attemptsUsed >= policy.maxAttempts && policy.lockAfterAttempts -> "LOCKED"
                else -> "INCORRECT"
            },
        )
    }
}

private data class AssessmentPolicy(
    val weight: BigDecimal = BigDecimal.ONE,
    val maxAttempts: Int = 3,
    val attemptPenalty: BigDecimal = BigDecimal("0.30"),
    val minimumCorrectFactor: BigDecimal = BigDecimal("0.40"),
    val defaultHintPenalty: BigDecimal = BigDecimal("0.15"),
    val minimumHintFactor: BigDecimal = BigDecimal("0.40"),
    val lockAfterAttempts: Boolean = true,
)

private data class AnswerValidationPolicy(
    val ignoreCase: Boolean = true,
    val ignorePunctuation: Boolean = true,
    val ignoreWhitespace: Boolean = true,
)

private data class UsedHint(
    val type: String,
    val penalty: BigDecimal,
)

private data class AnswerAttempt(
    val value: String,
    val optionId: String?,
)

private data class TeacherOverride(
    val correct: Boolean,
    val scoreFactor: BigDecimal?,
)

private data class ObjectiveItemScore(
    val blockId: String,
    val blockType: String,
    val itemKey: String,
    val correct: Boolean,
    val actual: String?,
    val weight: BigDecimal,
    val earnedWeight: BigDecimal,
    val scoreFactor: BigDecimal,
    val maxAttempts: Int,
    val attemptsUsed: Int,
    val incorrectAttempts: Int,
    val hintsUsed: Int,
    val errorsCount: Int,
    val status: String,
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

private fun materialAssessmentPolicy(block: JsonNode, item: JsonNode, blockType: String): AssessmentPolicy {
    val blockAssessment = block.get("assessment")?.takeIf { node -> node.isObject }
    val itemAssessment = item.get("assessment")?.takeIf { node -> node.isObject }
    fun decimal(name: String, default: BigDecimal): BigDecimal =
        itemAssessment?.decimalField(name)
            ?: item.decimalField(name)
            ?: blockAssessment?.decimalField(name)
            ?: block.decimalField(name)
            ?: default
    fun int(name: String, default: Int): Int =
        itemAssessment?.intField(name)
            ?: item.intField(name)
            ?: blockAssessment?.intField(name)
            ?: block.intField(name)
            ?: default
    fun boolean(name: String, default: Boolean): Boolean =
        itemAssessment?.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: item.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: blockAssessment?.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: block.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: default

    val fillGapMode = item.get("gapMode")?.asText()?.takeIf { value -> value.isNotBlank() }
        ?: if ((item.get("options") as? ArrayNode)?.size()?.let { count -> count > 0 } == true) "singleChoice" else "typed"
    val configuredMaxAttempts = when (blockType) {
        "matchingPairs" -> {
            blockAssessment?.intField("maxErrors")
                ?: block.intField("maxErrors")
                ?: blockAssessment?.intField("maxAttempts")
                ?: block.intField("maxAttempts")
                ?: 5
        }
        "fillGaps" -> {
            when (fillGapMode) {
                "singleChoice" -> (item.get("options") as? ArrayNode)?.size()?.takeIf { count -> count > 0 } ?: 1
                "wordBank" -> item.intField("maxErrors")
                    ?: itemAssessment?.intField("maxErrors")
                    ?: item.intField("maxAttempts")
                    ?: itemAssessment?.intField("maxAttempts")
                    ?: blockAssessment?.intField("maxErrors")
                    ?: block.intField("maxErrors")
                    ?: blockAssessment?.intField("maxAttempts")
                    ?: block.intField("maxAttempts")
                    ?: fillGapDefaultMaxErrors
                else -> item.intField("maxAttempts")
                    ?: itemAssessment?.intField("maxAttempts")
                    ?: blockAssessment?.intField("maxAttempts")
                    ?: block.intField("maxAttempts")
                    ?: fillGapDefaultMaxAttempts
            }
        }
        else -> int("maxAttempts", 3)
    }
    val cappedMaxAttempts = when (blockType) {
        "matchingPairs" -> {
            val pairCount = (block.get("pairs") as? ArrayNode)?.size() ?: configuredMaxAttempts
            configuredMaxAttempts.coerceIn(1, 10).coerceAtMost(pairCount.coerceAtLeast(1))
        }
        else -> configuredMaxAttempts.coerceIn(1, 10)
    }
    val attemptPenalty = if (blockType == "fillGaps") {
        BigDecimal("0.30")
    } else {
        decimal("attemptPenalty", BigDecimal("0.30")).between(BigDecimal.ZERO, BigDecimal.ONE)
    }
    val hintPenalty = if (blockType == "fillGaps") {
        BigDecimal("0.15")
    } else {
        decimal("hintPenalty", BigDecimal("0.15")).between(BigDecimal.ZERO, BigDecimal.ONE)
    }

    return AssessmentPolicy(
        weight = if (blockType == "fillGaps") BigDecimal.ONE else decimal("weight", BigDecimal.ONE).between(BigDecimal("0.10"), BigDecimal("20")),
        maxAttempts = cappedMaxAttempts,
        attemptPenalty = attemptPenalty,
        minimumCorrectFactor = decimal("minimumCorrectFactor", BigDecimal("0.40")).between(BigDecimal.ZERO, BigDecimal.ONE),
        defaultHintPenalty = hintPenalty,
        minimumHintFactor = decimal("minimumHintFactor", BigDecimal("0.40")).between(BigDecimal.ZERO, BigDecimal.ONE),
        lockAfterAttempts = boolean("lockAfterAttempts", true),
    )
}

private fun materialAnswerValidation(block: JsonNode, item: JsonNode): AnswerValidationPolicy {
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

private fun answerAttemptValues(answerBlock: JsonNode?, itemKey: String, actual: String?, actualOptionId: String? = null): List<AnswerAttempt> {
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

private fun matchingIncorrectAttempts(answerBlock: JsonNode?, matches: JsonNode?, pairs: ArrayNode): Int =
    pairs.sumOf { pair ->
        val expectedPairId = pair.get("id")?.asText()?.takeIf { value -> value.isNotBlank() } ?: return@sumOf 0
        answerAttemptValues(answerBlock, expectedPairId, matches?.get(expectedPairId)?.asText())
            .count { attempt -> attempt.value != expectedPairId }
    }

private fun answerHints(answerBlock: JsonNode?, itemKey: String, policy: AssessmentPolicy): List<UsedHint> {
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

private fun answerTeacherOverride(answerBlock: JsonNode?, itemKey: String): TeacherOverride? {
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

private fun answersMatch(actual: String?, expected: String, validation: AnswerValidationPolicy): Boolean =
    normalizedAssessmentAnswer(actual, validation) == normalizedAssessmentAnswer(expected, validation)

private fun normalizedAssessmentAnswer(value: String?, validation: AnswerValidationPolicy): String {
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

private fun JsonNode.decimalField(name: String): BigDecimal? {
    val node = get(name) ?: return null
    return when {
        node.isNumber -> node.decimalValue()
        node.isTextual -> node.asText().trim().takeIf { value -> value.isNotEmpty() }?.let { value ->
            runCatching { BigDecimal(value) }.getOrNull()
        }
        else -> null
    }
}

private fun JsonNode.intField(name: String): Int? {
    val node = get(name) ?: return null
    return when {
        node.isInt || node.isLong -> node.asInt()
        node.isTextual -> node.asText().trim().toIntOrNull()
        else -> null
    }
}

private fun BigDecimal.between(min: BigDecimal, max: BigDecimal): BigDecimal =
    this.max(min).min(max)

private fun ObjectiveItemScore.toJson(objectMapper: ObjectMapper): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("blockId", blockId)
        put("blockType", blockType)
        put("itemKey", itemKey)
        actual?.let { value -> put("actual", value) }
        put("correct", correct)
        put("status", status)
        put("weight", weight)
        put("earnedWeight", earnedWeight)
        put("scoreFactor", scoreFactor)
        put("maxAttempts", maxAttempts)
        put("attemptsUsed", attemptsUsed)
        put("incorrectAttempts", incorrectAttempts)
        put("hintsUsed", hintsUsed)
        put("errorsCount", errorsCount)
    }
