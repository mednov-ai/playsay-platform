package com.playsay.vocabulary.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

enum class VocabularySourceType { LESSON, HOMEWORK, MANUAL }
enum class TranslationState { MISSING, SUGGESTED, CONFIRMED }
enum class EntryStatus { ACTIVE, ARCHIVED }

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
    val occurrences: List<VocabularyOccurrenceResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class VocabularyPracticeResponse(val entries: List<VocabularyEntryResponse>)
