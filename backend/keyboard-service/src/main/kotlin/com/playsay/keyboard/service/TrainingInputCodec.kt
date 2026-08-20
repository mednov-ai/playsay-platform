package com.playsay.keyboard.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeParseException
import kotlin.math.round
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

@Component
class TrainingInputCodec {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun clientResultId(value: String?): String? =
        value?.trim()?.take(128)?.takeIf { candidate -> candidate.length >= 8 }

    fun lessonKind(value: String): String {
        val normalized = value.trim().uppercase()
        if (normalized !in supportedLessonKinds) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported lesson kind.")
        }
        return normalized
    }

    fun localDate(value: String?, timezone: String): LocalDate? {
        if (!value.isNullOrBlank()) {
            return try {
                LocalDate.parse(value.trim())
            } catch (_: DateTimeParseException) {
                null
            }
        }
        return runCatching { LocalDate.now(ZoneId.of(timezone(timezone))) }.getOrNull()
    }

    fun positiveDouble(value: Double, fallback: Double): Double =
        if (value.isFinite() && value >= 0.0) value else fallback.coerceAtLeast(0.0)

    fun ratio(value: Double): Double =
        when {
            !value.isFinite() -> 0.0
            value < 0.0 -> 0.0
            value > 1.0 -> 1.0
            else -> value
        }

    fun timezone(value: String): String {
        val candidate = value.trim().take(64).ifBlank { "UTC" }
        return runCatching { ZoneId.of(candidate).id }.getOrDefault("UTC")
    }

    fun errorMap(values: Map<String, Int>): Map<String, Int> =
        values.asSequence()
            .map { (key, value) -> key.trim() to value }
            .filter { (key, value) -> key.length in 1..16 && value > 0 }
            .sortedWith(compareByDescending<Pair<String, Int>> { (_, value) -> value }.thenBy { (key) -> key })
            .take(MAX_MAP_ENTRIES)
            .associate { (key, value) -> key to value.coerceAtMost(MAX_ERRORS_PER_KEY) }

    fun problemKeys(values: List<String>): List<String> =
        values.asSequence()
            .map(String::trim)
            .filter { value -> value.length in 1..16 }
            .distinct()
            .take(MAX_PROBLEM_KEYS)
            .toList()

    fun windowMetrics(values: Map<String, Double>): String =
        objectMapper.writeValueAsString(
            values.entries.asSequence()
                .filter { (key, value) -> key.length in 1..64 && value.isFinite() }
                .take(64)
                .associate { (key, value) -> key to round(value * 10.0) / 10.0 },
        ).take(4000)

    fun practiceContext(values: Map<String, Any?>): String =
        objectMapper.writeValueAsString(
            values.entries.asSequence()
                .filter { (key) -> key.length in 1..64 }
                .take(16)
                .associate { (key, value) -> key to practiceContextValue(value) }
                .filterValues { value -> value != null },
        ).take(2048)

    private fun practiceContextValue(value: Any?): Any? =
        when (value) {
            is String -> value.trim().take(160).ifBlank { null }
            is Number -> value
            is Boolean -> value
            is List<*> -> value.mapNotNull(::practiceContextValue).take(16)
            else -> null
        }

    private companion object {
        val supportedLessonKinds = setOf("CALIBRATION", "STANDARD", "FOCUS")
        const val MAX_MAP_ENTRIES = 32
        const val MAX_PROBLEM_KEYS = 8
        const val MAX_ERRORS_PER_KEY = 999
    }
}
