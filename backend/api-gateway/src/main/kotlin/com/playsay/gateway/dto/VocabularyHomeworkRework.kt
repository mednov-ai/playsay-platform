package com.playsay.gateway.dto

import java.util.UUID
import jakarta.validation.constraints.NotBlank

data class VocabularyHomeworkReworkRequest(
    val assignmentId: UUID,
    val sourceSessionId: UUID,
    @field:NotBlank val ownerSubject: String,
    @field:NotBlank val actorSubject: String,
)

data class VocabularyHomeworkReworkResponse(val sessionId: UUID)
