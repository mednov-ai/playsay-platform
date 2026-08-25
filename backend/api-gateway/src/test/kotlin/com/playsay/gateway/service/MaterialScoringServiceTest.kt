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

    @Test
    fun `schema v1 scores existing objective blocks and ignores flashcards`() {
        val document = objectMapper.readTree(
            """
            {
              "schemaVersion": 1,
              "pages": [
                {
                  "id": "page-1",
                  "title": "Existing exercises",
                  "layout": "FLOW",
                  "blocks": [
                    {
                      "id": "gap-block",
                      "type": "fillGaps",
                      "title": "Gap",
                      "items": [{ "id": "gap-1", "prompt": "I ___ ready.", "answer": "am", "acceptedAnswers": ["'m"] }]
                    },
                    {
                      "id": "choice-block",
                      "type": "multipleChoice",
                      "title": "Choice",
                      "items": [{ "id": "choice-1", "prompt": "Choose", "answer": "are", "choices": ["am", "is", "are"] }]
                    },
                    {
                      "id": "pair-block",
                      "type": "matchingPairs",
                      "title": "Pairs",
                      "pairs": [{ "id": "pair-1", "left": "cat", "right": "кот" }]
                    },
                    {
                      "id": "cards-block",
                      "type": "flashcards",
                      "title": "Cards",
                      "cards": [{ "id": "card-1", "front": "dog", "back": "собака" }]
                    }
                  ]
                }
              ]
            }
            """.trimIndent(),
        )
        val content = objectMapper.readTree(
            """
            {
              "schemaVersion": 1,
              "answers": {
                "gap-block": { "type": "fillGaps", "items": { "gap-1": "'m" } },
                "choice-block": { "type": "multipleChoice", "items": { "choice-1": "are" } },
                "pair-block": { "type": "matchingPairs", "matches": { "pair-1": "pair-1" } },
                "cards-block": { "type": "flashcards", "revealed": ["card-1"] }
              }
            }
            """.trimIndent(),
        )

        val result = assertNotNull(scoringService.score(document.toString(), """{"maxScore":10}""", content))

        assertEquals(0, BigDecimal.TEN.compareTo(result.score))
        assertEquals(0, result.errorsCount)
        assertEquals(
            listOf("fillGaps", "multipleChoice", "matchingPairs"),
            result.content["assessment"]["items"].map { item -> item["blockType"].asText() },
        )
    }

    @Test
    fun `schema v2 reuses objective scoring and leaves flashcards unscored`() {
        val document = objectMapper.readTree(
            """{"schemaVersion":2,"pages":[{"id":"p","title":"Page","layout":"WORKSHEET","blocks":[{"id":"w","type":"interactiveWorksheet","sourceAsset":"material-asset:00000000-0000-0000-0000-000000000001","intrinsicWidth":800,"intrinsicHeight":1200,"groups":[{"id":"g","order":0,"type":"FILL_GAPS","gapMode":"TYPED","gaps":[{"id":"gap","region":{"x":1,"y":1,"width":20,"height":20},"acceptedAnswers":["am"],"distractors":[]}]},{"id":"m","order":1,"type":"MATCHING_PAIRS","pairs":[{"id":"pair","number":1,"left":{"kind":"TEXT","text":"cat","region":{"x":1,"y":30,"width":20,"height":20}},"right":{"kind":"TEXT","text":"кот","region":{"x":50,"y":30,"width":20,"height":20}}}]},{"id":"c","order":2,"type":"MULTIPLE_CHOICE","questions":[{"id":"choice","prompt":"Pick","options":[{"id":"a","order":0,"text":"A","provenance":"TEACHER","confidence":1,"confirmed":true},{"id":"b","order":1,"text":"B","provenance":"TEACHER","confidence":1,"confirmed":true}],"correctOptionIds":["a","b"]}]},{"id":"f","order":3,"type":"FLASHCARDS","cards":[{"id":"card","order":0,"front":{"kind":"TEXT","text":"dog","provenance":"TEACHER","confidence":1,"confirmed":true},"back":{"kind":"TEXT","text":"собака","provenance":"TEACHER","confidence":1,"confirmed":true}}]}]}]}]}""",
        )
        val content = objectMapper.readTree("""{"answers":{"w":{"items":{"gap":"am"},"matches":{"pair":"pair"},"choiceItems":{"choice":["b","a"]}}}}""")

        val result = assertNotNull(scoringService.score(document.toString(), """{"maxScore":10}""", content))

        assertEquals(0, BigDecimal.TEN.compareTo(result.score))
        assertEquals(listOf("fillGaps", "matchingPairs", "multipleChoice"), result.content["assessment"]["items"].map { it["blockType"].asText() })
    }

    @Test
    fun `schema v2 preserves alternatives forms multi-answer attempts and hints across review refresh`() {
        val document = objectMapper.readTree(
            """{"schemaVersion":2,"pages":[{"id":"p","title":"Page","layout":"WORKSHEET","blocks":[{"id":"w","type":"interactiveWorksheet","sourceAsset":"material-asset:00000000-0000-0000-0000-000000000001","intrinsicWidth":800,"intrinsicHeight":1200,"groups":[{"id":"g","order":0,"type":"FILL_GAPS","gapMode":"FORM_TRANSFORM","gaps":[{"id":"form","baseForm":"go","region":{"x":1,"y":1,"width":20,"height":20},"acceptedAnswers":["went","had gone"]}]},{"id":"m","order":1,"type":"MATCHING_PAIRS","pairs":[{"id":"pair","number":1,"left":{"kind":"TEXT","text":"cat","region":{"x":1,"y":30,"width":20,"height":20}},"right":{"kind":"IMAGE","imageAlt":"cat picture","region":{"x":50,"y":30,"width":20,"height":20}}}]},{"id":"c","order":2,"type":"MULTIPLE_CHOICE","questions":[{"id":"choice","prompt":"Pick both","options":[{"id":"a","order":0,"text":"A"},{"id":"b","order":1,"text":"B"},{"id":"c","order":2,"text":"C"}],"correctOptionIds":["a","b"]}]},{"id":"f","order":3,"type":"FLASHCARDS","cards":[{"id":"card","order":0,"front":{"kind":"TEXT","text":"front"},"back":{"kind":"TEXT","text":"private back"}}]}]}]}]}""",
        )
        val content = objectMapper.readTree(
            """{"answers":{"w":{"items":{"form":"had gone"},"matches":{"pair":"pair"},"choiceItems":{"choice":["b","a"]},"attempts":{"form":[{"value":"goed","correct":false},{"value":"had gone","correct":true}],"pair":[{"value":"pair","correct":true}],"choice":[{"value":"a","correct":false},{"value":"a|b","correct":true}]},"hints":{"form":[{"type":"firstLetter","label":"h","penalty":0.15}]},"revealed":["card"]}}}""",
        )

        val first = assertNotNull(scoringService.score(document.toString(), """{"maxScore":10}""", content))
        val refreshed = assertNotNull(scoringService.score(document.toString(), """{"maxScore":10}""", objectMapper.readTree(content.toString())))

        assertEquals(0, first.score.compareTo(refreshed.score))
        assertEquals(listOf("CORRECT_WITH_HINT", "CORRECT", "CORRECT_AFTER_RETRY"), first.content["assessment"]["items"].map { it["status"].asText() })
        assertEquals(3, first.content["assessment"]["items"].size())
    }
}
