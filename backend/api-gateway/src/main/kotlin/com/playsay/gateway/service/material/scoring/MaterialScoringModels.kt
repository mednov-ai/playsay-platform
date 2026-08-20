package com.playsay.gateway.service.material.scoring

import java.math.BigDecimal
import com.fasterxml.jackson.databind.JsonNode

internal data class ObjectiveBlock(val node: JsonNode, val id: String, val type: String)

internal data class ObjectiveAnswer(
    val key: String,
    val expected: List<String>,
    val actual: String?,
    val block: JsonNode?,
)

internal data class ObjectiveItemRequest(
    val block: ObjectiveBlock,
    val item: JsonNode,
    val answer: ObjectiveAnswer,
    val forceLocked: Boolean = false,
)

internal data class ObjectiveAttemptOutcome(
    val correct: Boolean,
    val attemptsUsed: Int,
    val incorrectAttempts: Int,
    val hints: List<UsedHint>,
    val attempts: List<AnswerAttempt>,
    val overrideFactor: BigDecimal?,
)

internal data class AssessmentPolicy(
    val weight: BigDecimal = BigDecimal.ONE,
    val maxAttempts: Int = 3,
    val attemptPenalty: BigDecimal = BigDecimal("0.30"),
    val minimumCorrectFactor: BigDecimal = BigDecimal("0.40"),
    val defaultHintPenalty: BigDecimal = BigDecimal("0.15"),
    val minimumHintFactor: BigDecimal = BigDecimal("0.40"),
    val lockAfterAttempts: Boolean = true,
)

internal data class AnswerValidationPolicy(
    val ignoreCase: Boolean = true,
    val ignorePunctuation: Boolean = true,
    val ignoreWhitespace: Boolean = true,
)

internal data class UsedHint(
    val type: String,
    val penalty: BigDecimal,
)

internal data class AnswerAttempt(
    val value: String,
    val optionId: String?,
)

internal data class TeacherOverride(
    val correct: Boolean,
    val scoreFactor: BigDecimal?,
)

internal data class ObjectiveItemScore(
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
