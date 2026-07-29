package com.playsay.vocabulary.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

enum class VocabularySourceType { LESSON, HOMEWORK, MANUAL }
enum class TranslationState { MISSING, SUGGESTED, CONFIRMED }
enum class EntryStatus { ACTIVE, ARCHIVED }
enum class VocabularySkill { MEANING, FORM, SPELLING, CONTEXT }
enum class LearningStage { NEW, LEARNING, REVIEW, MASTERED }
enum class PracticeRating { AGAIN, HARD, GOOD }
enum class PracticeDelivery { SELF, HOMEWORK, LIVE }
enum class PracticeMode { QUICK, BALANCED, WRITING, KEYBOARD }
enum class PracticeStatus { PREPARING, PUBLISHED, ACTIVE, PAUSED, COMPLETED, CANCELLED, FAILED }
enum class SessionStatus { NOT_STARTED, IN_PROGRESS, PAUSED, COMPLETED, CANCELLED }
enum class PracticeSelectionReason { OVERDUE, PINNED, DUE_TODAY, RECENT_LESSON, NEW, CONTROL_REVIEW }
enum class PracticeReadinessWarning { MISSING_TRANSLATION, MISSING_EXACT_EXAMPLE, INSUFFICIENT_DISTRACTORS }
enum class PracticeExerciseType {
    FLASHCARD,
    MATCHING,
    MEANING_CHOICE,
    PHRASE_BUILDER,
    FORM_INPUT,
    CONTEXT_GAP,
    KEYBOARD,
}

data class TranslationSuggestionRequest(
    @field:NotBlank @field:Size(max = 240) val sourceText: String,
    @field:Size(max = 16) val sourceLanguage: String? = null,
    @field:Size(max = 16) val targetLanguage: String? = null,
    @field:Size(max = 1_000) val context: String? = null,
    @field:Size(max = 500) val instruction: String? = null,
    @field:Size(max = 8) val previousTranslations: List<@Size(max = 500) String> = emptyList(),
)

data class TranslationVariantResponse(
    val translation: String,
    val partOfSpeech: String?,
    val example: String?,
    val exampleTranslation: String?,
)

data class TranslationSuggestionResponse(
    val variants: List<TranslationVariantResponse>,
    val source: String,
) {
    val translation: String = variants.firstOrNull()?.translation.orEmpty()
    val partOfSpeech: String? = variants.firstOrNull()?.partOfSpeech
    val example: String? = variants.firstOrNull()?.example
    val exampleTranslation: String? = variants.firstOrNull()?.exampleTranslation
}

data class CreateVocabularyEntryRequest(
    @field:Size(max = 255) val ownerSubject: String? = null,
    @field:NotBlank @field:Size(max = 240) val sourceText: String,
    @field:Size(max = 16) val sourceLanguage: String? = null,
    @field:Size(max = 16) val targetLanguage: String? = null,
    @field:Size(max = 500) val translation: String? = null,
    @field:Size(max = 80) val partOfSpeech: String? = null,
    @field:Size(max = 1_000) val example: String? = null,
    @field:Size(max = 1_000) val exampleTranslation: String? = null,
    val translationState: TranslationState? = null,
    val sourceType: VocabularySourceType = VocabularySourceType.MANUAL,
    val lessonId: UUID? = null,
    val assignmentId: UUID? = null,
    val materialId: UUID? = null,
    @field:Size(max = 120) val blockId: String? = null,
    @field:Size(max = 1_000) val context: String? = null,
)

data class UpdateVocabularyEntryRequest(
    @field:Size(max = 500) val translation: String? = null,
    @field:Size(max = 80) val partOfSpeech: String? = null,
    @field:Size(max = 1_000) val example: String? = null,
    @field:Size(max = 1_000) val exampleTranslation: String? = null,
    val translationState: TranslationState? = null,
    val status: EntryStatus? = null,
    val practicePaused: Boolean? = null,
)

data class VocabularyOccurrenceResponse(
    val sourceType: VocabularySourceType,
    val lessonId: UUID?,
    val assignmentId: UUID?,
    val materialId: UUID?,
    val blockId: String?,
    val context: String?,
    val createdAt: Instant,
)

data class VocabularyEntryResponse(
    val id: UUID,
    val sourceText: String,
    val sourceLanguage: String,
    val targetLanguage: String,
    val translation: String?,
    val partOfSpeech: String?,
    val example: String?,
    val exampleTranslation: String?,
    val translationState: TranslationState,
    val status: EntryStatus,
    val practicePaused: Boolean = false,
    val occurrences: List<VocabularyOccurrenceResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class VocabularyEntryPracticeResponse(val entries: List<VocabularyEntryResponse>)

data class VocabularyOverviewResponse(
    val lessonEntries: List<VocabularyEntryResponse>,
    val recentEntries: List<VocabularyEntryResponse>,
)

data class VocabularySkillStateResponse(
    val skill: VocabularySkill,
    val stage: LearningStage,
    val intervalIndex: Int,
    val dueAt: Instant,
    val successStreak: Int,
    val lapseCount: Int,
    val lastRating: PracticeRating?,
    val lastPracticedAt: Instant?,
)

data class VocabularyLearningEntryResponse(
    val entry: VocabularyEntryResponse,
    val stage: LearningStage,
    val dueAt: Instant,
    val overdue: Boolean,
    val skills: List<VocabularySkillStateResponse>,
)

data class VocabularyDashboardResponse(
    val ownerSubject: String,
    val ownerName: String?,
    val totalCount: Int,
    val dueCount: Int,
    val learningCount: Int,
    val masteredCount: Int,
    val needsTranslationCount: Int,
    val difficultCount: Int,
    val lastPracticedAt: Instant?,
    val entries: List<VocabularyLearningEntryResponse>,
)

data class VocabularyLearnerSummaryResponse(
    val ownerSubject: String,
    val ownerName: String,
    val ownerUsername: String? = null,
    val totalCount: Int,
    val dueCount: Int,
    val learningCount: Int,
    val masteredCount: Int,
    val needsTranslationCount: Int,
    val difficultCount: Int,
    val lastPracticedAt: Instant?,
)

data class VocabularyPracticeOwnerOverrideRequest(
    @field:NotBlank @field:Size(max = 255) val ownerSubject: String,
    @field:Size(max = 100) val pinnedEntryIds: List<UUID> = emptyList(),
    @field:Size(max = 100) val excludedEntryIds: List<UUID> = emptyList(),
)

data class VocabularyPracticeSettingsRequest(
    @field:Size(max = 100) val ownerSubjects: List<@Size(max = 255) String> = emptyList(),
    val delivery: PracticeDelivery = PracticeDelivery.SELF,
    val mode: PracticeMode = PracticeMode.BALANCED,
    val lessonId: UUID? = null,
    val assignmentId: UUID? = null,
    @field:Min(1) @field:Max(30) val wordLimit: Int = 10,
    @field:Size(max = 100) val pinnedEntryIds: List<UUID> = emptyList(),
    @field:Size(max = 100) val excludedEntryIds: List<UUID> = emptyList(),
    @field:Size(max = 100) val ownerOverrides: List<VocabularyPracticeOwnerOverrideRequest> = emptyList(),
    val planId: UUID? = null,
    val planRevision: Long? = null,
)

data class VocabularyPracticeEntryPreviewResponse(
    val entry: VocabularyEntryResponse,
    val reason: PracticeSelectionReason,
    val readinessWarnings: Set<PracticeReadinessWarning> = emptySet(),
)

data class VocabularyPracticeExerciseDistributionResponse(
    val exerciseType: PracticeExerciseType,
    val count: Int,
)

data class VocabularyPracticeItemPreviewResponse(
    val entryId: UUID?,
    val exerciseType: PracticeExerciseType,
    val prompt: String,
)

data class VocabularyPracticeOwnerPreviewResponse(
    val ownerSubject: String,
    val ownerName: String?,
    val ownerUsername: String? = null,
    val selectedCount: Int,
    val estimatedItemCount: Int,
    val dueCount: Int,
    val newCount: Int,
    val needsTranslationCount: Int,
    val entries: List<VocabularyEntryResponse>,
    val selection: List<VocabularyPracticeEntryPreviewResponse> = emptyList(),
    val exerciseDistribution: List<VocabularyPracticeExerciseDistributionResponse> = emptyList(),
    val sampleItems: List<VocabularyPracticeItemPreviewResponse> = emptyList(),
)

data class VocabularyPracticePreviewResponse(
    val planId: UUID,
    val revision: Long,
    val expiresAt: Instant,
    val mode: PracticeMode,
    val delivery: PracticeDelivery,
    val estimatedMinutes: Int,
    val owners: List<VocabularyPracticeOwnerPreviewResponse>,
)

data class VocabularyPracticeItemResponse(
    val id: UUID,
    val position: Int,
    val entryId: UUID?,
    val skill: VocabularySkill,
    val exerciseType: PracticeExerciseType,
    val prompt: String,
    val options: List<String>,
    val sourceText: String?,
    val translation: String?,
    val example: String?,
    val schemaVersion: Int = 1,
    val content: Map<String, Any?> = emptyMap(),
    val affectsSchedule: Boolean = true,
)

data class VocabularyPracticeRevealResponse(
    val itemId: UUID,
    val expectedAnswer: String,
)

data class VocabularyPracticeSessionSummaryResponse(
    val id: UUID,
    val ownerSubject: String,
    val ownerName: String?,
    val status: SessionStatus,
    val revision: Long,
    val completedItems: Int,
    val totalItems: Int,
    val correctCount: Int,
    val attemptCount: Int,
    val accuracy: Double?,
    val currentItem: VocabularyPracticeItemResponse?,
    val teacherHint: String?,
    val helpRequested: Boolean,
    val startedAt: Instant?,
    val completedAt: Instant?,
    val updatedAt: Instant,
    val practiceId: UUID? = null,
    val delivery: PracticeDelivery? = null,
    val mode: PracticeMode? = null,
    val lessonId: UUID? = null,
    val assignmentId: UUID? = null,
)

data class VocabularyPracticeResponse(
    val id: UUID,
    val delivery: PracticeDelivery,
    val mode: PracticeMode,
    val status: PracticeStatus,
    val lessonId: UUID?,
    val assignmentId: UUID?,
    val sessions: List<VocabularyPracticeSessionSummaryResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class VocabularyActivePracticeResponse(val practice: VocabularyPracticeResponse?)

data class VocabularyAttemptRequest(
    @field:NotBlank @field:Size(max = 128) val clientAttemptId: String,
    val itemId: UUID,
    val sessionRevision: Long,
    @field:Size(max = 2_000) val answer: String? = null,
    val rating: PracticeRating? = null,
    val hintsUsed: Int = 0,
    val durationMs: Long = 0,
)

data class VocabularyAttemptResponse(
    val attemptId: UUID,
    val rating: PracticeRating,
    val correct: Boolean,
    val expectedAnswer: String,
    val session: VocabularyPracticeSessionSummaryResponse,
)

data class VocabularyPracticeStatusRequest(val status: PracticeStatus)

data class VocabularyKeySetResponse(
    val sessionId: UUID,
    val title: String,
    val entries: List<VocabularyEntryResponse>,
    val items: List<VocabularyKeyItemResponse>,
)

data class VocabularyKeyItemResponse(
    val itemId: UUID,
    val entryId: UUID,
    val sourceText: String,
)

data class VocabularyKeyResultRequest(
    @field:NotBlank @field:Size(max = 128) val clientResultId: String,
    @field:Size(min = 1, max = 100) val attempts: List<VocabularyKeyWordAttemptRequest>,
)

data class VocabularyKeyWordAttemptRequest(
    val itemId: UUID,
    val entryId: UUID,
    @field:Min(0) val errors: Int,
)

data class VocabularyHomeworkPreparationRequest(
    @field:NotBlank @field:Size(max = 255) val actorSubject: String,
    val assignmentId: UUID,
    @field:Size(min = 1, max = 100) val ownerSubjects: List<@Size(max = 255) String>,
    val mode: PracticeMode = PracticeMode.BALANCED,
    @field:Min(1) @field:Max(30) val wordLimit: Int = 10,
    @field:Size(max = 100) val pinnedEntryIds: List<UUID> = emptyList(),
    @field:Size(max = 100) val excludedEntryIds: List<UUID> = emptyList(),
    val sourcePracticeId: UUID? = null,
    val planId: UUID? = null,
    val planRevision: Long? = null,
)

data class VocabularyHomeworkPreparationResponse(
    val practiceId: UUID,
    val sessions: List<VocabularyHomeworkSessionRef>,
)

data class VocabularyHomeworkSessionRef(
    val sessionId: UUID,
    val ownerSubject: String,
)
