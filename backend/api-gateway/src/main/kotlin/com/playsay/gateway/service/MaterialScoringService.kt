package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.service.material.scoring.MaterialObjectiveScorer
import java.math.BigDecimal
import org.springframework.stereotype.Component

data class MaterialScoringResult(
    val score: BigDecimal,
    val errorsCount: Int,
    val content: JsonNode,
)

@Component
class MaterialScoringService(
    objectMapper: ObjectMapper,
    private val objectiveScorer: MaterialObjectiveScorer = MaterialObjectiveScorer(objectMapper),
) {
    fun maxScore(scoringRubric: String): BigDecimal? = objectiveScorer.maxScore(scoringRubric)

    fun score(documentJson: String, scoringRubric: String, content: JsonNode): MaterialScoringResult? =
        objectiveScorer.score(documentJson, scoringRubric, content)
}
