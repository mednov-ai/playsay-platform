package com.playsay.vocabulary.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import jakarta.validation.Valid
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
enum class VocabularyHomeworkCompletionPolicy { MEANINGFUL_ACTIVITY, COMPLETE_SESSION, MASTERY_TARGET, TEACHER_REVIEW }
enum class VocabularyKeyMode { WHOLE_WORDS, CHARACTER_NGRAMS, MIXED }
enum class VocabularyKeyTargetType { WHOLE_WORD, CHARACTER_NGRAM }
enum class PracticeSelectionReason { OVERDUE, PINNED, DUE_TODAY, RECENT_LESSON, NEW, CONTROL_REVIEW, LAPSED, DIFFICULT, FAVORITE, LESSON, COURSE, EXPLICIT, FULL_DICTIONARY }
enum class PracticeReadinessWarning { MISSING_TRANSLATION, MISSING_EXACT_EXAMPLE, INSUFFICIENT_DISTRACTORS }
enum class LexicalCatalogScope { LEARNER, SCHOOL, GLOBAL }
enum class LexicalContentStatus { ACTIVE, SUPERSEDED }
enum class LexicalImageability { UNKNOWN, IMAGEABLE, NON_IMAGEABLE, SUPPRESSED }
enum class VocabularyMediaAssetState { GENERATING, CANDIDATE, APPROVED, REJECTED, FAILED, SUPERSEDED }
enum class VocabularyMediaGenerationState { PENDING, PROCESSING, COMPLETED, FAILED, SUPPRESSED }
enum class VocabularyMediaSafetyState { PENDING, SAFE, BLOCKED, PROVIDER_REJECTED, UNKNOWN }
enum class VocabularyMediaOverrideKind { DEFAULT, HIDE, APPROVED_ALTERNATIVE }
enum class VocabularyMediaReviewAction { APPROVE, REJECT }
enum class VocabularyEvidenceType { PRESENTATION, RETRIEVAL, SELF_RATING, HINT, CORRECTION, KEY_TARGET }
enum class MemoryReviewReason { NEW, DUE, LAPSED, DIFFICULT, STABLE }
enum class VocabularySelectionSource { RECENT, DUE, FORGOTTEN, DIFFICULT, NEW, FAVORITE, LESSON, COURSE, FULL_DICTIONARY, EXPLICIT }
enum class VocabularySelectionMatch { ANY, ALL }
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
    val courseId: UUID? = null,
    @field:Size(max = 120) val blockId: String? = null,
    @field:Size(max = 128) val sourceRevision: String? = null,
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
    val favorite: Boolean? = null,
)

data class VocabularyOccurrenceResponse(
    val sourceType: VocabularySourceType,
    val lessonId: UUID?,
    val assignmentId: UUID?,
    val materialId: UUID?,
    val courseId: UUID?,
    val blockId: String?,
    val sourceRevision: String?,
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
    val favorite: Boolean = false,
)

data class VocabularyEntryPracticeResponse(val entries: List<VocabularyEntryResponse>)

data class VocabularyMediaViewResponse(
    val entryId: UUID,
    val senseId: UUID?,
    val imageability: LexicalImageability?,
    val state: String,
    val asset: VocabularyMediaAssetResponse? = null,
    val alternatives: List<VocabularyMediaAssetResponse> = emptyList(),
    val generationPending: Boolean = false,
    val hidden: Boolean = false,
    val failureCode: String? = null,
)

data class VocabularyMediaAssetResponse(
    val id: UUID,
    val senseId: UUID,
    val state: VocabularyMediaAssetState,
    val contentUrl: String?,
    val contentType: String?,
    val width: Int?,
    val height: Int?,
    val checksumSha256: String?,
    val origin: String,
    val generatorType: String?,
    val generatorModel: String?,
    val promptTemplateVersion: String?,
    val safetyState: VocabularyMediaSafetyState,
    val altText: Map<String, String>,
    val decorative: Boolean,
    val createdAt: Instant,
    val reviewHistory: List<VocabularyMediaReviewEventResponse> = emptyList(),
)

data class VocabularyMediaReviewEventResponse(
    val action: String,
    val actorSubject: String,
    val reasonCode: String?,
    val note: String?,
    val createdAt: Instant,
)

data class VocabularyMediaOverrideRequest(
    val kind: VocabularyMediaOverrideKind,
    val assetId: UUID? = null,
)

data class VocabularyMediaReportRequest(
    @field:Size(max = 64) val reasonCode: String = "WRONG_SENSE",
)

data class VocabularyMediaReviewRequest(
    val action: VocabularyMediaReviewAction,
    @field:Size(max = 64) val reasonCode: String? = null,
    @field:Size(max = 500) val note: String? = null,
)

data class VocabularyMediaImageabilityRequest(val imageability: LexicalImageability)

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
    val policyVersion: String = "legacy-v1",
    val reviewReason: MemoryReviewReason = MemoryReviewReason.NEW,
    val difficultyScore: Double = 0.0,
    val available: Boolean = true,
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
    val selection: VocabularySelectionCriteriaRequest? = null,
    val recipeId: UUID? = null,
    @field:Size(max = 128) val materializationKey: String? = null,
    val completionPolicy: VocabularyHomeworkCompletionPolicy = VocabularyHomeworkCompletionPolicy.COMPLETE_SESSION,
    @field:Valid val completionThresholds: VocabularyCompletionThresholdsRequest = VocabularyCompletionThresholdsRequest(),
    val keyMode: VocabularyKeyMode = VocabularyKeyMode.WHOLE_WORDS,
    @field:Valid val keyNgramSettings: VocabularyKeyNgramSettingsRequest = VocabularyKeyNgramSettingsRequest(),
)

data class VocabularyKeyNgramSettingsRequest(
    @field:Min(2) @field:Max(8) val minLength: Int = 2,
    @field:Min(2) @field:Max(8) val maxLength: Int = 5,
    @field:Min(1) @field:Max(200) val targetLimit: Int = 64,
    @field:Min(1) @field:Max(4) val maxRepetitions: Int = 2,
)

data class VocabularyCompletionThresholdsRequest(
    @field:Min(1) @field:Max(100) val distinctGradedPrompts: Int = 8,
    @field:Min(1) @field:Max(30) val distinctEntries: Int = 4,
    @field:Min(1) @field:Max(100) val masteryPercent: Int = 80,
    @field:NotBlank @field:Size(max = 64) val policyVersion: String = "vocabulary-homework-v1",
)

data class VocabularySelectionCriteriaRequest(
    val sources: Set<VocabularySelectionSource> = emptySet(),
    val match: VocabularySelectionMatch = VocabularySelectionMatch.ANY,
    @field:Min(1) @field:Max(365) val recentDays: Int = 14,
    val lessonId: UUID? = null,
    val courseId: UUID? = null,
    @field:Size(max = 100) val explicitEntryIds: List<UUID> = emptyList(),
    @field:Min(0) @field:Max(30) val maxNewItems: Int = 3,
    @field:Min(1) @field:Max(120) val targetMinutes: Int? = null,
    val preferredSkills: Set<VocabularySkill> = emptySet(),
)

data class VocabularySelectionRecipeRequest(
    @field:NotBlank @field:Size(max = 120) val name: String,
    val selection: VocabularySelectionCriteriaRequest,
    @field:Size(max = 100) val pinnedEntryIds: List<UUID> = emptyList(),
    @field:Size(max = 100) val excludedEntryIds: List<UUID> = emptyList(),
    val mode: PracticeMode = PracticeMode.BALANCED,
    @field:Min(1) @field:Max(30) val wordLimit: Int = 10,
)

data class VocabularySelectionRecipeResponse(
    val id: UUID,
    val name: String,
    val revision: Long,
    val selection: VocabularySelectionCriteriaRequest,
    val pinnedEntryIds: List<UUID>,
    val excludedEntryIds: List<UUID>,
    val mode: PracticeMode,
    val wordLimit: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class VocabularySelectionExclusionResponse(val entryId: UUID, val reason: String)

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
    val eligibilityWatermark: Instant? = null,
    val materializationSeed: Long = 0,
    val categoryCounts: Map<String, Int> = emptyMap(),
    val exclusions: List<VocabularySelectionExclusionResponse> = emptyList(),
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
    val lastAcknowledgedPosition: Int = 0,
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
    val mode: VocabularyKeyMode = VocabularyKeyMode.WHOLE_WORDS,
    val layout: String = "EN",
    val materializerVersion: String = "legacy-v1",
    val materializerSeed: Long = 0,
    val ngramSettings: VocabularyKeyNgramSettingsRequest = VocabularyKeyNgramSettingsRequest(),
    val targets: List<VocabularyKeyTargetResponse> = emptyList(),
    val completionContext: VocabularyKeyCompletionContextResponse? = null,
    val returnContext: VocabularyKeyReturnContextResponse? = null,
)

data class VocabularyKeyItemResponse(
    val itemId: UUID,
    val entryId: UUID,
    val sourceText: String,
)

data class VocabularyKeyTargetResponse(
    val targetId: UUID,
    val position: Int,
    val type: VocabularyKeyTargetType,
    val text: String,
    val sourceEntryIds: List<UUID>,
    val sourceItemIds: List<UUID>,
    val offsets: List<VocabularyKeySourceOffsetResponse>,
)

data class VocabularyKeySourceOffsetResponse(
    val entryId: UUID,
    val itemId: UUID,
    val start: Int,
    val endExclusive: Int,
)

data class VocabularyKeyCompletionContextResponse(
    val delivery: PracticeDelivery,
    val completionPolicy: VocabularyHomeworkCompletionPolicy,
    val completionPolicyVersion: String,
    val assignmentId: UUID?,
    val lessonId: UUID?,
    val lastAcknowledgedPosition: Int,
)

data class VocabularyKeyReturnContextResponse(
    val target: String,
    val path: String,
)

data class VocabularyKeyAcknowledgementRequest(
    @field:Min(0) val position: Int,
    val targetId: UUID? = null,
)

data class VocabularyKeyAcknowledgementResponse(
    val sessionId: UUID,
    val lastAcknowledgedPosition: Int,
    val revision: Long,
)

data class VocabularyKeyResultRequest(
    @field:NotBlank @field:Size(max = 128) val clientResultId: String,
    @field:Size(min = 1, max = 100) val attempts: List<VocabularyKeyWordAttemptRequest>,
)

data class VocabularyKeyWordAttemptRequest(
    val itemId: UUID,
    val entryId: UUID,
    @field:Min(0) val errors: Int,
    val resultId: UUID? = null,
    val targetId: UUID? = null,
    val targetType: VocabularyKeyTargetType = VocabularyKeyTargetType.WHOLE_WORD,
    @field:Min(0) val durationMs: Long = 0,
    @field:Min(0) val position: Int = 0,
    @field:Size(max = 200) val typedText: String? = null,
    @field:Size(max = 20) val sourceEntryIds: List<UUID> = emptyList(),
    @field:Size(max = 20) val sourceItemIds: List<UUID> = emptyList(),
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
    val completionPolicy: VocabularyHomeworkCompletionPolicy = VocabularyHomeworkCompletionPolicy.MEANINGFUL_ACTIVITY,
    @field:Valid val completionThresholds: VocabularyCompletionThresholdsRequest = VocabularyCompletionThresholdsRequest(),
    val keyMode: VocabularyKeyMode = VocabularyKeyMode.WHOLE_WORDS,
    @field:Valid val keyNgramSettings: VocabularyKeyNgramSettingsRequest = VocabularyKeyNgramSettingsRequest(),
)

data class VocabularyHomeworkPreparationResponse(
    val practiceId: UUID,
    val sessions: List<VocabularyHomeworkSessionRef>,
)

data class VocabularyHomeworkSessionRef(
    val sessionId: UUID,
    val ownerSubject: String,
)
