package com.playsay.gateway.service

import java.math.BigDecimal
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AssignmentProgressCalculatorTest {
    private val calculator = AssignmentProgressCalculator()

    @Test
    fun `score ratio is rounded and clamped to zero one range`() {
        assertEquals(BigDecimal("0.80"), calculator.scoreRatio(BigDecimal("8"), BigDecimal("10")))
        assertEquals(BigDecimal("1.00"), calculator.scoreRatio(BigDecimal("12"), BigDecimal("10")))
        assertEquals(BigDecimal("0.00"), calculator.scoreRatio(BigDecimal("-1"), BigDecimal("10")))
        assertNull(calculator.scoreRatio(BigDecimal("1"), BigDecimal.ZERO))
    }

    @Test
    fun `progress tone combines current score and current error count`() {
        assertEquals(76, calculator.progressTone(BigDecimal("8"), BigDecimal("10"), errorsCount = 1))
        assertEquals(62, calculator.progressTone(score = null, maxScore = BigDecimal("10"), errorsCount = 2))
        assertEquals(0, calculator.progressTone(BigDecimal.ZERO, BigDecimal("10"), errorsCount = 8))
        assertNull(calculator.progressTone(score = null, maxScore = BigDecimal("10"), errorsCount = null))
    }

    @Test
    fun `average rounds to two decimals`() {
        assertEquals(BigDecimal("6.67"), calculator.average(listOf(BigDecimal("10"), BigDecimal("5"), BigDecimal("5"))))
        assertNull(calculator.average(emptyList()))
    }
}
