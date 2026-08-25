package com.playsay.gateway.service.material.scoring

import com.playsay.gateway.service.MaterialScoringResult

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import java.math.BigDecimal
import org.springframework.stereotype.Component


@Component
class MaterialObjectiveScorer(
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
        val itemScores = scorePages(pages, answerRoot)
        if (itemScores.isEmpty()) return null
        return serializeScoringResult(
            objectMapper = objectMapper,
            maxScore = maxScore(scoringRubric) ?: BigDecimal.TEN,
            assessedContent = assessedContent,
            itemScores = itemScores,
        )
    }

    private fun scorePages(pages: ArrayNode, answerRoot: JsonNode): List<ObjectiveItemScore> =
        pages.flatMap { page ->
            val blocks = page["blocks"] as? ArrayNode ?: return@flatMap emptyList()
            blocks.flatMap { block -> scoreBlock(block, answerRoot) }
        }

    private fun scoreBlock(block: JsonNode, answerRoot: JsonNode): List<ObjectiveItemScore> {
        val blockId = block["id"]?.asText()?.takeIf(String::isNotBlank) ?: return emptyList()
        val blockType = block["type"]?.asText().orEmpty()
        val answerBlock = answerRoot[blockId]
        return when (blockType) {
            "fillGaps", "multipleChoice" -> scoreAnswerItems(block, blockId, blockType, answerBlock)
            "matchingPairs" -> scoreMatchingPairs(block, blockId, answerBlock)
            "interactiveWorksheet" -> scoreWorksheet(block, blockId, answerBlock)
            else -> emptyList()
        }
    }

    private fun scoreWorksheet(block: JsonNode, blockId: String, answerBlock: JsonNode?): List<ObjectiveItemScore> {
        val groups = block.get("groups") as? ArrayNode ?: return emptyList()
        val answers = answerBlock?.get("items")?.takeIf(JsonNode::isObject)
        val matches = answerBlock?.get("matches")?.takeIf(JsonNode::isObject)
        val choices = answerBlock?.get("choiceItems")?.takeIf(JsonNode::isObject)
        return groups.flatMap { group -> scoreWorksheetGroup(group, blockId, answerBlock, answers, matches, choices) }
    }

    private fun scoreWorksheetGroup(
        group: JsonNode,
        blockId: String,
        answerBlock: JsonNode?,
        answers: JsonNode?,
        matches: JsonNode?,
        choices: JsonNode?,
    ): List<ObjectiveItemScore> = when (group.path("type").asText()) {
        "FILL_GAPS" -> (group.get("gaps") as? ArrayNode).orEmpty().mapNotNull { gap ->
            val id = gap.path("id").asText().takeIf(String::isNotBlank) ?: return@mapNotNull null
            val expected = gap.acceptedAnswers().takeIf(List<String>::isNotEmpty) ?: return@mapNotNull null
            scoreObjectiveItem(ObjectiveItemRequest(
                block = ObjectiveBlock(group, blockId, "fillGaps"), item = gap,
                answer = ObjectiveAnswer(id, expected, answers?.get(id)?.asText(), answerBlock),
            ))
        }
        "MATCHING_PAIRS" -> (group.get("pairs") as? ArrayNode).orEmpty().mapNotNull { pair ->
            val id = pair.path("id").asText().takeIf(String::isNotBlank) ?: return@mapNotNull null
            scoreObjectiveItem(ObjectiveItemRequest(
                block = ObjectiveBlock(group, blockId, "matchingPairs"), item = pair,
                answer = ObjectiveAnswer(id, listOf(id), matches?.get(id)?.asText(), answerBlock),
            ))
        }
        "MULTIPLE_CHOICE" -> (group.get("questions") as? ArrayNode).orEmpty().mapNotNull { question ->
            scoreWorksheetChoice(group, blockId, answerBlock, choices, question)
        }
        else -> emptyList()
    }

    private fun scoreWorksheetChoice(
        group: JsonNode,
        blockId: String,
        answerBlock: JsonNode?,
        choices: JsonNode?,
        question: JsonNode,
    ): ObjectiveItemScore? {
        val id = question.path("id").asText().takeIf(String::isNotBlank) ?: return null
        val expected = question.path("correctOptionIds").takeIf(JsonNode::isArray)?.map { it.asText() }?.sorted().orEmpty()
        if (expected.isEmpty()) return null
        val actualNode = choices?.get(id)
        val actual = if (actualNode?.isArray == true) actualNode.map { it.asText() }.sorted().joinToString("|") else actualNode?.asText()
        val synthetic = (question as? ObjectNode)?.deepCopy() ?: objectMapper.createObjectNode()
        synthetic.putArray("acceptedAnswers").add(expected.joinToString("|"))
        return scoreObjectiveItem(ObjectiveItemRequest(
            block = ObjectiveBlock(group, blockId, "multipleChoice"), item = synthetic,
            answer = ObjectiveAnswer(id, listOf(expected.joinToString("|")), actual, answerBlock),
        ))
    }

    private fun ArrayNode?.orEmpty(): List<JsonNode> = this?.toList().orEmpty()

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
            scoreObjectiveItem(ObjectiveItemRequest(
                block = ObjectiveBlock(block, blockId, blockType),
                item = item,
                answer = ObjectiveAnswer(answerKey, expected, answerItems?.get(answerKey)?.asText(), answerBlock),
            ))
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
            scoreObjectiveItem(ObjectiveItemRequest(
                block = ObjectiveBlock(block, blockId, "matchingPairs"),
                item = pair,
                answer = ObjectiveAnswer(expectedPairId, listOf(expectedPairId), matches?.get(expectedPairId)?.asText(), answerBlock),
                forceLocked = globallyLocked,
            ))
        }
    }

    private fun scoreObjectiveItem(request: ObjectiveItemRequest): ObjectiveItemScore {
        val policy = materialAssessmentPolicy(request.block.node, request.item, request.block.type)
        val validation = materialAnswerValidation(request.block.node, request.item)
        val outcome = attemptOutcome(request, policy, validation)
        val scoreFactor = objectiveScoreFactor(outcome, policy)
        val errorsCount = when {
            outcome.attempts.isNotEmpty() -> outcome.incorrectAttempts
            !outcome.correct -> 1
            else -> 0
        }

        return ObjectiveItemScore(
            blockId = request.block.id,
            blockType = request.block.type,
            itemKey = request.answer.key,
            correct = outcome.correct,
            actual = request.answer.actual?.trim(),
            weight = policy.weight,
            earnedWeight = policy.weight.multiply(scoreFactor),
            scoreFactor = scoreFactor,
            maxAttempts = policy.maxAttempts,
            attemptsUsed = outcome.attemptsUsed,
            incorrectAttempts = outcome.incorrectAttempts,
            hintsUsed = outcome.hints.size,
            errorsCount = errorsCount,
            status = objectiveStatus(request.forceLocked, outcome, policy),
        )
    }

    private fun attemptOutcome(
        request: ObjectiveItemRequest,
        policy: AssessmentPolicy,
        validation: AnswerValidationPolicy,
    ): ObjectiveAttemptOutcome {
        val override = answerTeacherOverride(request.answer.block, request.answer.key)
        val expectedOptionId = request.item.get("answerOptionId")
            ?.asText()
            ?.trim()
            ?.takeIf { it.isNotEmpty() && request.item["gapMode"]?.asText() == "wordBank" }
        val actualOptionId = request.answer.block?.get("optionIds")?.get(request.answer.key)?.asText()?.trim()?.takeIf(String::isNotEmpty)
        val attempts = answerAttemptValues(request.answer.block, request.answer.key, request.answer.actual, actualOptionId)
        val hints = answerHints(request.answer.block, request.answer.key, policy)
        val actualCorrect = objectiveAnswerMatches(request.answer, validation, expectedOptionId, actualOptionId)
        val correct = override?.correct ?: actualCorrect
        val incorrectAttempts = incorrectAttemptCount(attempts, request.answer.expected, validation, expectedOptionId)
        val attemptsUsed = attempts.size.takeIf { it > 0 } ?: if (request.answer.actual.isNullOrBlank()) 0 else 1
        return ObjectiveAttemptOutcome(correct, attemptsUsed, incorrectAttempts, hints, attempts, override?.scoreFactor)
    }

    private fun objectiveScoreFactor(outcome: ObjectiveAttemptOutcome, policy: AssessmentPolicy): BigDecimal {
        if (!outcome.correct) return BigDecimal.ZERO
        val attemptFactor =
            BigDecimal.ONE
                .subtract(policy.attemptPenalty.multiply(BigDecimal.valueOf((outcome.attemptsUsed - 1).coerceAtLeast(0).toLong())))
                .max(policy.minimumCorrectFactor)
        val hintPenalty = outcome.hints.fold(BigDecimal.ZERO) { total, hint -> total + hint.penalty }
        val hintFactor = BigDecimal.ONE.subtract(hintPenalty).max(policy.minimumHintFactor)
        return listOfNotNull(attemptFactor, hintFactor, outcome.overrideFactor).minOrNull()
            ?.between(BigDecimal.ZERO, BigDecimal.ONE) ?: BigDecimal.ONE
    }

    private fun objectiveStatus(
        forceLocked: Boolean,
        outcome: ObjectiveAttemptOutcome,
        policy: AssessmentPolicy,
    ): String = when {
        outcome.correct && outcome.hints.isEmpty() && outcome.attemptsUsed <= 1 -> "CORRECT"
        outcome.correct && outcome.hints.isNotEmpty() -> "CORRECT_WITH_HINT"
        outcome.correct -> "CORRECT_AFTER_RETRY"
        forceLocked && policy.lockAfterAttempts -> "LOCKED"
        outcome.attemptsUsed >= policy.maxAttempts && policy.lockAfterAttempts -> "LOCKED"
        else -> "INCORRECT"
    }

    private fun objectiveAnswerMatches(
        answer: ObjectiveAnswer,
        validation: AnswerValidationPolicy,
        expectedOptionId: String?,
        actualOptionId: String?,
    ): Boolean = if (expectedOptionId != null) {
        !answer.actual.isNullOrBlank() && actualOptionId == expectedOptionId
    } else {
        answer.expected.any { answersMatch(answer.actual, it, validation) }
    }

    private fun incorrectAttemptCount(
        attempts: List<AnswerAttempt>,
        expected: List<String>,
        validation: AnswerValidationPolicy,
        expectedOptionId: String?,
    ): Int = attempts.count { attempt ->
        expectedOptionId?.let { attempt.optionId != it }
            ?: expected.none { answersMatch(attempt.value, it, validation) }
    }
}
