package com.playsay.keyboard.dto

import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import java.util.UUID

data class SubmitResultRequest(
    val clientResultId: String? = null,
    @field:Min(1)
    val chordSetId: Long,
    val lessonKind: String = "STANDARD",
    @field:PositiveOrZero
    val speedCpm: Double,
    @field:PositiveOrZero
    val averageCpm: Double = speedCpm,
    @field:DecimalMin("0.0")
    @field:DecimalMax("1.0")
    val cadence: Double = 1.0,
    @field:DecimalMin("0.0")
    @field:DecimalMax("1.0")
    val accuracy: Double,
    @field:PositiveOrZero
    val errors: Int,
    @field:PositiveOrZero
    val characterCount: Int = 0,
    @field:PositiveOrZero
    val correctCount: Int = 0,
    @field:Min(1)
    val durationMs: Long,
    val perFinger: Map<String, Int> = emptyMap(),
    val perChar: Map<String, Int> = emptyMap(),
    val perChord: Map<String, Int> = emptyMap(),
    val focusProblemKeys: List<String> = emptyList(),
    val windowMetrics: Map<String, Double> = emptyMap(),
    val clientTimezone: String = "UTC",
    val localTrainingDate: String? = null,
    val practiceContext: Map<String, Any?> = emptyMap(),
    @field:Size(max = 200) val vocabularyResults: List<KeyboardVocabularyTargetResultRequest> = emptyList(),
)

data class KeyboardVocabularyTargetResultRequest(
    val resultId: UUID,
    val targetId: UUID,
    val targetType: String,
    @field:PositiveOrZero val errors: Int,
    @field:PositiveOrZero val durationMs: Long,
    @field:PositiveOrZero val position: Int,
    @field:Size(max = 200) val typedText: String? = null,
    @field:Size(max = 20) val sourceEntryIds: List<UUID> = emptyList(),
    @field:Size(max = 20) val sourceItemIds: List<UUID> = emptyList(),
)

data class SubmitAnonymousResultRequest(
    val deviceId: String,
    val displayName: String? = null,
    val clientResultId: String? = null,
    @field:Min(1)
    val chordSetId: Long,
    val lessonKind: String = "STANDARD",
    @field:PositiveOrZero
    val speedCpm: Double,
    @field:PositiveOrZero
    val averageCpm: Double = speedCpm,
    @field:DecimalMin("0.0")
    @field:DecimalMax("1.0")
    val cadence: Double = 1.0,
    @field:DecimalMin("0.0")
    @field:DecimalMax("1.0")
    val accuracy: Double,
    @field:PositiveOrZero
    val errors: Int,
    @field:PositiveOrZero
    val characterCount: Int = 0,
    @field:PositiveOrZero
    val correctCount: Int = 0,
    @field:Min(1)
    val durationMs: Long,
    val perFinger: Map<String, Int> = emptyMap(),
    val perChar: Map<String, Int> = emptyMap(),
    val perChord: Map<String, Int> = emptyMap(),
    val focusProblemKeys: List<String> = emptyList(),
    val windowMetrics: Map<String, Double> = emptyMap(),
    val clientTimezone: String = "UTC",
    val localTrainingDate: String? = null,
    val practiceContext: Map<String, Any?> = emptyMap(),
)

data class TrainingResultResponse(
    val id: Long,
    val clientResultId: String?,
    val chordSetId: Long,
    val layout: String,
    val lessonKind: String,
    val speedCpm: Double,
    val averageCpm: Double,
    val cadence: Double,
    val masteryCpm: Double?,
    val masteryDelta: Double,
    val accuracy: Double,
    val errors: Int,
    val characterCount: Int,
    val correctCount: Int,
    val durationMs: Long,
    val perChar: Map<String, Int>,
    val perChord: Map<String, Int>,
    val focusProblemKeys: List<String>,
    val clientTimezone: String,
    val localTrainingDate: String?,
    val practiceContext: Map<String, Any?>,
    val createdAt: String,
    val focusLesson: FocusLessonResponse? = null,
)

data class SubmitTrainingResultResponse(
    val trainingResult: TrainingResultResponse,
    val progress: ProgressResponse,
    val gamification: GamificationProfileResponse,
    val events: List<GamificationEventResponse>,
    val techniqueAdvice: TechniqueAdviceResponse,
    val focusLesson: FocusLessonResponse? = trainingResult.focusLesson,
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
    val masteryCpm: Double?,
    val weakFingers: List<FingerErrorsResponse>,
    val recent: List<TrainingResultResponse>,
    val gamification: GamificationProfileResponse? = null,
)

data class GamificationProfileResponse(
    val calibrated: Boolean,
    val calibrationSessions: Int,
    val calibrationTarget: Int,
    val masteryCpm: Double,
    val baselineMasteryCpm: Double?,
    val leagueLevel: Int?,
    val leagueProgress: Int,
    val currentStreak: Int,
    val bestStreak: Int,
    val streakFreezes: Int,
    val lastTrainingDate: String?,
    val trend: List<Double>,
    val achievements: List<String>,
    val layoutMastery: Map<String, LayoutMasteryProfileResponse> = emptyMap(),
    val activeLayoutMastery: LayoutMasteryProfileResponse? = null,
)

data class LayoutMasteryProfileResponse(
    val layout: String,
    val calibrated: Boolean,
    val calibrationSessions: Int,
    val calibrationTarget: Int,
    val masteryCpm: Double,
    val baselineMasteryCpm: Double?,
    val leagueLevel: Int?,
    val leagueProgress: Int,
    val trend: List<Double>,
)

data class GamificationEventResponse(
    val id: Long,
    val type: String,
    val payload: Map<String, String>,
    val createdAt: String,
)

data class TechniqueAdviceResponse(
    val primaryAdvice: String,
    val drillSuggestion: String,
    val tone: String,
    val source: String = "RULES",
)

data class ClaimAnonymousProgressRequest(
    val deviceId: String,
)

data class ClaimAnonymousProgressResponse(
    val claimedResults: Int,
    val progress: ProgressResponse,
)

data class FingerErrorsResponse(
    val finger: String,
    val errors: Int,
)

data class ResolveAnonymousProfileRequest(
    val deviceId: String,
)

data class ResetAnonymousProfileRequest(
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
