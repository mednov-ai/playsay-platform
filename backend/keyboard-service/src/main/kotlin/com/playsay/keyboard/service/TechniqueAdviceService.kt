package com.playsay.keyboard.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.keyboard.dto.TechniqueAdviceResponse
import com.playsay.keyboard.entity.TechniqueAdviceCacheEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.repo.TechniqueAdviceCacheRepo
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.MessageSource
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import java.util.Locale

@Service
class TechniqueAdviceService(
    private val adviceCacheRepo: TechniqueAdviceCacheRepo,
    private val messageSource: MessageSource,
    @param:Value("\${playsay.keyboard.ai.provider:}") private val aiProvider: String,
    @param:Value("\${playsay.keyboard.ai.model:}") private val aiModel: String,
    @param:Value("\${playsay.keyboard.ai.api-key:}") private val aiApiKey: String,
    @param:Value("\${playsay.keyboard.ai.base-url:https://api.openai.com/v1}") private val aiBaseUrl: String,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun advice(
        result: TrainingResultEntity,
        recent: List<TrainingResultEntity>,
        requestedLocale: Locale,
    ): TechniqueAdviceResponse {
        val locale = normalizeLocale(requestedLocale)
        val rules = ruleAdvice(result, recent, locale)
        if (!aiEnabled(result, recent)) {
            return rules
        }

        val fingerprint = adviceFingerprint(result, recent)
        adviceCacheRepo.findByFingerprintAndLocale(fingerprint, locale.language)?.let { cached ->
            return TechniqueAdviceResponse(
                primaryAdvice = cached.primaryAdvice,
                drillSuggestion = cached.drillSuggestion,
                tone = cached.tone,
                source = cached.source,
            )
        }
        val aiAdvice = aiAdvice(result, recent, rules, locale) ?: return rules
        adviceCacheRepo.save(
            TechniqueAdviceCacheEntity(
                fingerprint = fingerprint,
                locale = locale.language,
                trainingResultId = result.id,
                source = aiAdvice.source,
                primaryAdvice = aiAdvice.primaryAdvice,
                drillSuggestion = aiAdvice.drillSuggestion,
                tone = aiAdvice.tone,
            ),
        )
        return aiAdvice
    }

    private fun aiEnabled(result: TrainingResultEntity, recent: List<TrainingResultEntity>): Boolean =
        aiProvider.equals("openai", ignoreCase = true) &&
            aiModel.isNotBlank() &&
            aiApiKey.isNotBlank() &&
            result.id > 0 &&
            recent.size >= 3

    private fun ruleAdvice(
        result: TrainingResultEntity,
        recent: List<TrainingResultEntity>,
        locale: Locale,
    ): TechniqueAdviceResponse {
        val problemChord = topProblem(result.perChord, threshold = 2)
        if (problemChord != null) {
            return TechniqueAdviceResponse(
                primaryAdvice = message("techniqueAdvice.chord.primary", locale, problemChord),
                drillSuggestion = message("techniqueAdvice.chord.drill", locale, problemChord),
                tone = "ACCURACY",
            )
        }
        val problemChar = topProblem(result.perChar, threshold = 3)
        if (problemChar != null) {
            return TechniqueAdviceResponse(
                primaryAdvice = message("techniqueAdvice.character.primary", locale, problemChar),
                drillSuggestion = message("techniqueAdvice.character.drill", locale, problemChar),
                tone = "ACCURACY",
            )
        }
        if (result.cadence < 0.65) {
            return TechniqueAdviceResponse(
                primaryAdvice = message("techniqueAdvice.rhythm.primary", locale),
                drillSuggestion = message("techniqueAdvice.rhythm.drill", locale),
                tone = "RHYTHM",
            )
        }
        val previousAccuracy = recent.drop(1).take(2).map { it.accuracy }.average().takeIf { it.isFinite() }
        if (previousAccuracy != null && result.accuracy + 0.02 < previousAccuracy) {
            return TechniqueAdviceResponse(
                primaryAdvice = message("techniqueAdvice.accuracyTrend.primary", locale),
                drillSuggestion = message("techniqueAdvice.accuracyTrend.drill", locale),
                tone = "ACCURACY",
            )
        }
        if (result.accuracy < 0.96 || result.errors > 0) {
            return TechniqueAdviceResponse(
                primaryAdvice = message("techniqueAdvice.accuracy.primary", locale),
                drillSuggestion = message("techniqueAdvice.accuracy.drill", locale),
                tone = "ACCURACY",
            )
        }
        return TechniqueAdviceResponse(
            primaryAdvice = message("techniqueAdvice.steady.primary", locale),
            drillSuggestion = message("techniqueAdvice.steady.drill", locale),
            tone = "STEADY",
        )
    }

    private fun aiAdvice(
        result: TrainingResultEntity,
        recent: List<TrainingResultEntity>,
        rules: TechniqueAdviceResponse,
        locale: Locale,
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
                .body(aiRequest(result, recent, rules, locale))
                .retrieve()
                .body(JsonNode::class.java)
            parseAdvice(response)
        } catch (_: RestClientException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }

    internal fun aiRequest(
        result: TrainingResultEntity,
        recent: List<TrainingResultEntity>,
        rules: TechniqueAdviceResponse,
        requestedLocale: Locale,
    ): Map<String, Any> = normalizeLocale(requestedLocale).let { locale ->
        mapOf(
            "model" to aiModel,
            "store" to false,
            "max_output_tokens" to 220,
            "reasoning" to mapOf("effort" to "low"),
            "input" to listOf(
                mapOf(
                    "role" to "system",
                    "content" to "Return only compact JSON with primaryAdvice, drillSuggestion, tone. " +
                        "Write advice in ${languageName(locale)}. No PII, no raw typing stream.",
                ),
                mapOf(
                    "role" to "user",
                    "content" to objectMapper.writeValueAsString(adviceInput(result, recent, rules, locale)),
                ),
            ),
        )
    }

    private fun adviceInput(
        result: TrainingResultEntity,
        recent: List<TrainingResultEntity>,
        rules: TechniqueAdviceResponse,
        locale: Locale,
    ): Map<String, Any?> =
        mapOf(
            "responseLanguage" to locale.language,
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

    private fun message(code: String, locale: Locale, vararg args: Any): String =
        messageSource.getMessage(code, args, locale)

    private fun normalizeLocale(locale: Locale): Locale =
        if (locale.language.lowercase() in supportedLanguages) {
            Locale.forLanguageTag(locale.language.lowercase())
        } else {
            defaultLocale
        }

    private fun languageName(locale: Locale): String =
        when (locale.language) {
            "en" -> "English"
            "de" -> "German"
            "fr" -> "French"
            else -> "Russian"
        }

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
        val defaultLocale: Locale = Locale.forLanguageTag("ru")
        val supportedLanguages = setOf("ru", "en", "de", "fr")
    }
}
