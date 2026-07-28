package com.playsay.vocabulary.mapper

import com.playsay.vocabulary.dto.*
import com.playsay.vocabulary.entity.VocabularyEntryEntity

fun VocabularyEntryEntity.toResponse() = VocabularyEntryResponse(
    id, sourceText, sourceLanguage, targetLanguage, translation, partOfSpeech, example, exampleTranslation,
    translationState, status, practicePaused,
    occurrences.map { VocabularyOccurrenceResponse(it.sourceType, it.lessonId, it.assignmentId, it.materialId, it.blockId, it.context, it.createdAt) },
    createdAt, updatedAt,
)
