package com.playsay.gateway.service.material.scoring

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.playsay.gateway.service.MaterialScoringResult
import java.math.BigDecimal
import java.math.RoundingMode

internal fun serializeScoringResult(
    objectMapper: ObjectMapper,
    maxScore: BigDecimal,
    assessedContent: ObjectNode,
    itemScores: List<ObjectiveItemScore>,
): MaterialScoringResult {
    val totalWeight = itemScores.fold(BigDecimal.ZERO) { total, item -> total + item.weight }
    val earnedWeight = itemScores.fold(BigDecimal.ZERO) { total, item -> total + item.earnedWeight }
    val errorsCount = itemScores.sumOf(ObjectiveItemScore::errorsCount)
    val score = maxScore.multiply(earnedWeight).divide(totalWeight, 2, RoundingMode.HALF_UP)
    val items = objectMapper.createArrayNode().apply { itemScores.forEach { add(it.toJson(objectMapper)) } }
    assessedContent.set<ObjectNode>("assessment", objectMapper.createObjectNode().apply {
        put("schemaVersion", 1); put("maxScore", maxScore); put("score", score)
        put("errorsCount", errorsCount); put("totalWeight", totalWeight); put("earnedWeight", earnedWeight)
        set<ArrayNode>("items", items)
    })
    return MaterialScoringResult(score, errorsCount, assessedContent)
}

internal fun ObjectiveItemScore.toJson(objectMapper: ObjectMapper): ObjectNode =
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
