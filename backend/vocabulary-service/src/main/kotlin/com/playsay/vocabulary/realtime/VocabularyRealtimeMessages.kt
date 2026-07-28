package com.playsay.vocabulary.realtime

import com.fasterxml.jackson.annotation.JsonInclude
import com.playsay.vocabulary.dto.VocabularyEntryResponse
import com.playsay.vocabulary.dto.VocabularyPracticeResponse
import java.util.UUID

data class VocabularyRealtimeInboundMessage(
    val type: String? = null,
    val ownerSubject: String? = null,
    val lessonId: UUID? = null,
    val practiceId: UUID? = null,
)

data class VocabularyEntryChangedEvent(
    val type: String,
    val ownerSubject: String,
    val lessonId: UUID?,
    val actorSubject: String,
    val entry: VocabularyEntryResponse,
)

data class VocabularyPracticeChangedEvent(
    val type: String,
    val actorSubject: String,
    val practiceId: UUID,
    val lessonId: UUID?,
    val ownerSubjects: Set<String>,
    val sessionId: UUID?,
    val practice: VocabularyPracticeResponse,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class VocabularyRealtimeOutboundMessage(
    val type: String,
    val ownerSubject: String? = null,
    val lessonId: UUID? = null,
    val practiceId: UUID? = null,
    val sessionId: UUID? = null,
    val actorSubject: String? = null,
    val entry: VocabularyEntryResponse? = null,
    val practice: VocabularyPracticeResponse? = null,
    val message: String? = null,
)
