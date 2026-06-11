package com.playsay.keyboard.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.keyboard.dto.TechniqueAdviceResponse
import com.playsay.keyboard.entity.TrainingResultEntity
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import java.util.concurrent.ConcurrentHashMap

@Service
class TechniqueAdviceService(
    @param:Value("\${playsay.keyboard.ai.provider:}") private val aiProvider: String,
    @param:Value("\${playsay.keyboard.ai.model:}") private val aiModel: String,
    @param:Value("\${playsay.keyboard.ai.api-key:}") private val aiApiKey: String,
    @param:Value("\${playsay.keyboard.ai.base-url:https://api.openai.com/v1}") private val aiBaseUrl: String,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()
    private val cache = ConcurrentHashMap<String, TechniqueAdviceResponse>()

    fun advice(result: TrainingResultEntity, recent: List<TrainingResultEntity>): TechniqueAdviceResponse {
        val rules = ruleAdvice(result, recent)
        if (!aiEnabled(result, recent)) {
            return rules
        }

        val fingerprint = adviceFingerprint(result, recent)
        return cache.computeIfAbsent(fingerprint) {
            aiAdvice(result, recent, rules) ?: rules
        }
    }

    private fun aiEnabled(result: TrainingResultEntity, recent: List<TrainingResultEntity>): Boolean =
        aiProvider.equals("openai", ignoreCase = true) &&
            aiModel.isNotBlank() &&
            aiApiKey.isNotBlank() &&
            result.id > 0 &&
            recent.size >= 3

    private fun ruleAdvice(result: TrainingResultEntity, recent: List<TrainingResultEntity>): TechniqueAdviceResponse {
        val problemChord = topProblem(result.perChord, threshold = 2)
        if (problemChord != null) {
            return TechniqueAdviceResponse(
                primaryAdvice = "Повторите сочетание $problemChord медленнее и ровнее: оно чаще всего сбивало точность.",
                drillSuggestion = "Сделайте короткий фокус-урок на $problemChord.",
                tone = "ACCURACY",
            )
        }
        val problemChar = topProblem(result.perChar, threshold = 3)
        if (problemChar != null) {
            return TechniqueAdviceResponse(
                primaryAdvice = "Проверьте движение к клавише $problemChar: держите кисть спокойно и не ускоряйте удар.",
                drillSuggestion = "Потренируйте $problemChar в связках с домашним рядом.",
                tone = "ACCURACY",
            )
        }
        if (result.cadence < 0.65) {
            return TechniqueAdviceResponse(
                primaryAdvice = "Ритм сейчас важнее скорости: выровняйте интервалы между нажатиями.",
                drillSuggestion = "Включите метроном и снизьте темп на один шаг.",
                tone = "RHYTHM",
            )
        }
        val previousAccuracy = recent.drop(1).take(2).map { it.accuracy }.average().takeIf { it.isFinite() }
        if (previousAccuracy != null && result.accuracy + 0.02 < previousAccuracy) {
            return TechniqueAdviceResponse(
                primaryAdvice = "Мастерство растет, но точность просела: закрепите набор без ускорения.",
                drillSuggestion = "Повторите тот же набор и цельтесь в 97%+ точности.",
                tone = "ACCURACY",
            )
        }
        if (result.accuracy < 0.96 || result.errors > 0) {
            return TechniqueAdviceResponse(
                primaryAdvice = "Снизьте темп на один шаг и доберите чистоту попаданий.",
                drillSuggestion = "Повторите набор до серии без частых ошибок.",
                tone = "ACCURACY",
            )
        }
        return TechniqueAdviceResponse(
            primaryAdvice = "Техника ровная: можно мягко прибавить темп и сохранить тот же ритм.",
            drillSuggestion = "Добавьте 5-10 BPM или переходите к следующему набору.",
            tone = "STEADY",
        )
    }

    private fun aiAdvice(
        result: TrainingResultEntity,
        recent: List<TrainingResultEntity>,
        rules: TechniqueAdviceResponse,
    ): TechniqueAdviceResponse? =
        try {
            val response = RestClient.builder()
                .baseUrl(aiBaseUrl.trimEnd('/'))
                .build()
                .post()
                .uri("/responses")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer $aiApiKey")
                .body(aiRequest(result, recent, rules))
                .retrieve()
                .body(JsonNode::class.java)
            parseAdvice(response)
        } catch (_: RestClientException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }

    private fun aiRequest(
        result: TrainingResultEntity,
        recent: List<TrainingResultEntity>,
        rules: TechniqueAdviceResponse,
    ): Map<String, Any> =
        mapOf(
            "model" to aiModel,
            "store" to false,
            "max_output_tokens" to 220,
            "reasoning" to mapOf("effort" to "low"),
            "input" to listOf(
                mapOf(
                    "role" to "system",
                    "content" to "Return only compact JSON with primaryAdvice, drillSuggestion, tone. No PII, no raw typing stream.",
                ),
                mapOf(
                    "role" to "user",
                    "content" to objectMapper.writeValueAsString(adviceInput(result, recent, rules)),
                ),
            ),
        )

    private fun adviceInput(
        result: TrainingResultEntity,
        recent: List<TrainingResultEntity>,
        rules: TechniqueAdviceResponse,
    ): Map<String, Any?> =
        mapOf(
            "current" to mapOf(
                "averageCpm" to result.averageCpm,
                "masteryCpm" to result.masteryCpm,
                "masteryDelta" to result.masteryDelta,
                "cadence" to result.cadence,
                "accuracy" to result.accuracy,
                "errors" to result.errors,
                "characterCount" to result.characterCount,
                "correctCount" to result.correctCount,
            ),
            "topWeakChars" to topProblems(result.perChar, 5),
            "topWeakChords" to topProblems(result.perChord, 5),
            "recent" to recent.take(5).map {
                mapOf(
                    "averageCpm" to it.averageCpm,
                    "masteryCpm" to it.masteryCpm,
                    "cadence" to it.cadence,
                    "accuracy" to it.accuracy,
                    "errors" to it.errors,
                )
            },
            "ruleAdvice" to mapOf(
                "primaryAdvice" to rules.primaryAdvice,
                "drillSuggestion" to rules.drillSuggestion,
                "tone" to rules.tone,
            ),
        )

    private fun parseAdvice(response: JsonNode?): TechniqueAdviceResponse? {
        val text = response?.path("output_text")?.asText(null)
            ?: response?.path("output")?.findValues("text")?.firstOrNull()?.asText(null)
            ?: return null
        val json = objectMapper.readTree(text)
        val primaryAdvice = json.path("primaryAdvice").asText("").trim()
        val drillSuggestion = json.path("drillSuggestion").asText("").trim()
        val tone = json.path("tone").asText("").trim().uppercase()
        if (primaryAdvice.isBlank() || drillSuggestion.isBlank() || tone !in allowedTones) {
            return null
        }
        return TechniqueAdviceResponse(
            primaryAdvice = primaryAdvice.take(240),
            drillSuggestion = drillSuggestion.take(180),
            tone = tone,
            source = "AI",
        )
    }

    private fun adviceFingerprint(result: TrainingResultEntity, recent: List<TrainingResultEntity>): String =
        listOf(
            result.id,
            result.averageCpm,
            result.masteryCpm,
            result.masteryDelta,
            result.cadence,
            result.accuracy,
            result.errors,
            topProblems(result.perChar, 5),
            topProblems(result.perChord, 5),
            recent.take(5).map { "${it.id}:${it.masteryCpm}:${it.averageCpm}:${it.cadence}:${it.accuracy}:${it.errors}" },
        ).joinToString("|")

    private fun topProblem(values: Map<String, Int>, threshold: Int): String? =
        values.entries
            .filter { (_, value) -> value >= threshold }
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { entry -> entry.value }.thenBy { entry -> entry.key })
            .firstOrNull()
            ?.key

    private fun topProblems(values: Map<String, Int>, limit: Int): List<Map<String, Any>> =
        values.entries
            .filter { (_, value) -> value > 0 }
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { entry -> entry.value }.thenBy { entry -> entry.key })
            .take(limit)
            .map { (key, value) -> mapOf("value" to key, "errors" to value) }

    private companion object {
        val allowedTones = setOf("ACCURACY", "RHYTHM", "STEADY")
    }
}
