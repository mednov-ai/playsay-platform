package com.playsay.keyboard.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.keyboard.entity.GamificationProfileEntity
import org.springframework.stereotype.Service
import kotlin.math.round

@Service
class MasteryService {
    fun update(profile: GamificationProfileEntity, averageCpm: Double, accuracy: Double, cadence: Double): MasteryUpdate {
        val cleanAverage = cleanPositiveDouble(averageCpm, 0.0)
        val cleanAccuracy = cleanRatio(accuracy)
        val cleanCadence = cleanRatio(cadence)
        val qualityMultiplier = (0.55 + 0.45 * cleanCadence) * (0.7 + 0.3 * cleanAccuracy)
        val effectiveTempo = cleanAverage * qualityMultiplier
        val previous = profile.masteryCpm.takeIf { value -> value > 0.0 }
        val alpha = when {
            previous == null -> 1.0
            effectiveTempo < previous && (cleanCadence < 0.55 || cleanAccuracy < 0.93) -> 0.34
            cleanCadence >= 0.75 && cleanAccuracy >= 0.96 -> 0.42
            cleanCadence >= 0.65 && cleanAccuracy >= 0.93 -> 0.28
            else -> 0.18
        }
        val next = previous?.let { value -> value + (effectiveTempo - value) * alpha } ?: effectiveTempo
        val roundedNext = roundOne(next)
        val delta = previous?.let { roundOne(roundedNext - it) } ?: 0.0

        profile.masteryCpm = roundedNext
        profile.trendJson = trendJson(readDoubleList(profile.trendJson) + roundedNext)
        return MasteryUpdate(masteryCpm = roundedNext, masteryDelta = delta)
    }

    private fun cleanPositiveDouble(value: Double, fallback: Double): Double =
        if (value.isFinite() && value >= 0.0) value else fallback.coerceAtLeast(0.0)

    private fun cleanRatio(value: Double): Double =
        when {
            !value.isFinite() -> 0.0
            value < 0.0 -> 0.0
            value > 1.0 -> 1.0
            else -> value
        }

    private fun roundOne(value: Double): Double = round(value * 10.0) / 10.0

    private fun readDoubleList(value: String): List<Double> =
        runCatching { objectMapper.readValue(value, doubleListType) }.getOrDefault(emptyList())

    private fun trendJson(values: List<Double>): String =
        objectMapper.writeValueAsString(values.takeLast(10))

    private companion object {
        val objectMapper: ObjectMapper = jacksonObjectMapper()
        val doubleListType = object : TypeReference<List<Double>>() {}
    }
}

data class MasteryUpdate(
    val masteryCpm: Double,
    val masteryDelta: Double,
)
