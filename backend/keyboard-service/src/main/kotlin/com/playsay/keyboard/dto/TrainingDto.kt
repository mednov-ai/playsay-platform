package com.playsay.keyboard.dto

import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.PositiveOrZero

data class SubmitResultRequest(
    @field:Min(1)
    val chordSetId: Long,
    val lessonKind: String = "STANDARD",
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
    val perChar: Map<String, Int> = emptyMap(),
    val perChord: Map<String, Int> = emptyMap(),
    val focusProblemKeys: List<String> = emptyList(),
)

data class SubmitAnonymousResultRequest(
    val deviceId: String,
    val displayName: String? = null,
    @field:Min(1)
    val chordSetId: Long,
    val lessonKind: String = "STANDARD",
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
    val perChar: Map<String, Int> = emptyMap(),
    val perChord: Map<String, Int> = emptyMap(),
    val focusProblemKeys: List<String> = emptyList(),
)

data class TrainingResultResponse(
    val id: Long,
    val chordSetId: Long,
    val lessonKind: String,
    val speedCpm: Double,
    val accuracy: Double,
    val errors: Int,
    val durationMs: Long,
    val perChar: Map<String, Int>,
    val perChord: Map<String, Int>,
    val focusProblemKeys: List<String>,
    val createdAt: String,
    val focusLesson: FocusLessonResponse? = null,
)

data class FocusLessonResponse(
    val kind: String = "FOCUS",
    val sourceChordSetId: Long,
    val layout: String,
    val reason: String,
    val problemKeys: List<String>,
    val chords: List<String>,
    val title: String,
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

data class ResolveAnonymousProfileRequest(
    val deviceId: String,
)

data class UpdateAnonymousProfileRequest(
    val deviceId: String,
    val displayName: String,
)

data class AnonymousProfileResponse(
    val id: Long,
    val deviceId: String,
    val displayName: String?,
    val sessions: Int,
)
