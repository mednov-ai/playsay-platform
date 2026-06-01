package com.playsay.gateway.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.math.BigDecimal
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class MaterialScoringServiceTest {
    private val objectMapper = jacksonObjectMapper()
    private val scoringService = MaterialScoringService(objectMapper)

    @Test
    fun `scores fill gap attempts and hints without repository state`() {
        val document = """
            {
              "schemaVersion": 1,
              "pages": [
                {
                  "id": "page-1",
                  "title": "Attempts",
                  "layout": "FLOW",
                  "blocks": [
                    {
                      "id": "gaps",
                      "type": "fillGaps",
                      "title": "Fill gaps",
                      "assessment": {
                        "attemptPenalty": 0.30,
                        "hintPenalty": 0.15,
                        "minimumCorrectFactor": 0.40
                      },
                      "items": [
                        {
                          "prompt": "It is ___ cat.",
                          "answer": "a",
                          "options": ["a", "an", "-"],
                          "weight": 2
                        },
                        {
                          "prompt": "It is ___ apple.",
                          "answer": "an",
                          "options": ["a", "an", "-"],
                          "weight": 1
                        }
                      ]
                    }
                  ]
                }
              ]
            }
        """.trimIndent()
        val content = objectMapper.readTree(
            """
            {
              "schemaVersion": 1,
              "answers": {
                "gaps": {
                  "type": "fillGaps",
                  "items": {
                    "It is ___ cat.-0": "a",
                    "It is ___ apple.-1": "an"
                  },
                  "attempts": {
                    "It is ___ cat.-0": [
                      { "value": "an", "correct": false },
                      { "value": "a", "correct": true }
                    ],
                    "It is ___ apple.-1": [
                      { "value": "an", "correct": true }
                    ]
                  },
                  "hints": {
                    "It is ___ cat.-0": [
                      { "type": "firstLetter", "penalty": 0.15 }
                    ]
                  }
                }
              }
            }
            """.trimIndent(),
        )

        val result = assertNotNull(scoringService.score(document, """{"maxScore":10}""", content))

        assertEquals(0, BigDecimal("8.50").compareTo(result.score))
        assertEquals(1, result.errorsCount)
        val assessment = result.content["assessment"]
        assertEquals(1, assessment["errorsCount"].asInt())
        assertEquals(0, BigDecimal("2").compareTo(assessment["totalWeight"].decimalValue()))
        val firstItem = assessment["items"][0]
        assertEquals("CORRECT_WITH_HINT", firstItem["status"].asText())
        assertEquals(2, firstItem["attemptsUsed"].asInt())
        assertEquals(1, firstItem["hintsUsed"].asInt())
        assertEquals(0, BigDecimal("0.70").compareTo(firstItem["scoreFactor"].decimalValue()))
    }
}
