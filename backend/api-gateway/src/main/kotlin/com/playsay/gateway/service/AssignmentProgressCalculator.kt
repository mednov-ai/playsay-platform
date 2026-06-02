package com.playsay.gateway.service

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.roundToInt
import org.springframework.stereotype.Component

@Component
class AssignmentProgressCalculator {
    fun scoreRatio(score: BigDecimal?, maxScore: BigDecimal?): BigDecimal? {
        if (score == null || maxScore == null || maxScore.compareTo(BigDecimal.ZERO) <= 0) {
            return null
        }
        return score.divide(maxScore, 4, RoundingMode.HALF_UP)
            .coerceIn(BigDecimal.ZERO, BigDecimal.ONE)
            .setScale(2, RoundingMode.HALF_UP)
    }

    fun progressTone(score: BigDecimal?, maxScore: BigDecimal?, errorsCount: Int?): Int? {
        if (score == null && errorsCount == null) {
            return null
        }
        val scorePercent = scoreRatio(score, maxScore)
            ?.multiply(BigDecimal("100"))
            ?.toDouble()
            ?: errorsCount?.let { errors -> 100.0 - (errors * 15.0) }
            ?: return null
        val errorPenalty = (errorsCount ?: 0).coerceAtLeast(0).coerceAtMost(8) * 4.0
        return (scorePercent - errorPenalty).roundToInt().coerceIn(0, 100)
    }

    fun average(values: List<BigDecimal>): BigDecimal? {
        if (values.isEmpty()) {
            return null
        }
        return values.reduce(BigDecimal::add).divide(BigDecimal(values.size), 2, RoundingMode.HALF_UP)
    }
}

private fun BigDecimal.coerceIn(min: BigDecimal, max: BigDecimal): BigDecimal =
    when {
        this < min -> min
        this > max -> max
        else -> this
    }
