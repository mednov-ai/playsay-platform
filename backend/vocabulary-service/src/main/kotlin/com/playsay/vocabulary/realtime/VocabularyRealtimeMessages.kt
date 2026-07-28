package com.playsay.vocabulary.realtime

import com.fasterxml.jackson.annotation.JsonInclude
import com.playsay.vocabulary.dto.VocabularyEntryResponse
import java.util.UUID

data class VocabularyRealtimeInboundMessage(
    val type: String? = null,
    val ownerSubject: String? = null,
    val lessonId: UUID? = null,
)

data class VocabularyEntryChangedEvent(
    val type: String,
    val ownerSubject: String,
    val lessonId: UUID?,
    val actorSubject: String,
    val entry: VocabularyEntryResponse,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class VocabularyRealtimeOutboundMessage(
    val type: String,
    val ownerSubject: String? = null,
    val lessonId: UUID? = null,
    val actorSubject: String? = null,
    val entry: VocabularyEntryResponse? = null,
    val message: String? = null,
)
