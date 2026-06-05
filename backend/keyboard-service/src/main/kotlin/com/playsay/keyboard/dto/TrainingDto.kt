package com.playsay.keyboard.dto

import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.PositiveOrZero

data class SubmitResultRequest(
    @field:Min(1)
    val chordSetId: Long,
    @field:PositiveOrZero
    val speedCpm: Double,
    @field:DecimalMin("0.0")
    @field:DecimalMax("1.0")
    val accuracy: Double,
    @field:PositiveOrZero
    val errors: Int,
    @field:Min(1)
    val durationMs: Long,
    val perFinger: Map<String, Int> = emptyMap(),
)

data class TrainingResultResponse(
    val id: Long,
    val chordSetId: Long,
    val speedCpm: Double,
    val accuracy: Double,
    val errors: Int,
    val durationMs: Long,
    val createdAt: String,
)

data class ProgressResponse(
    val sessions: Int,
    val bestSpeedCpm: Double,
    val avgSpeedCpm: Double,
    val avgAccuracy: Double,
    val weakFingers: List<FingerErrorsResponse>,
    val recent: List<TrainingResultResponse>,
)

data class FingerErrorsResponse(
    val finger: String,
    val errors: Int,
)
