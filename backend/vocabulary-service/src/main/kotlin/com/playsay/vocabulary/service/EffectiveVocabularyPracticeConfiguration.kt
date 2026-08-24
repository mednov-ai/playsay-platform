package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import java.util.UUID

/** The single immutable configuration consumed by practice persistence and materialization. */
data class EffectiveVocabularyPracticeConfiguration(
    val settings: VocabularyPracticeSettingsRequest,
    val plan: ResolvedVocabularyPracticePlan,
    val lessonId: UUID?,
)
