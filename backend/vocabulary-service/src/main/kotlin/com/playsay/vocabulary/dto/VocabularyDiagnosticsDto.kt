package com.playsay.vocabulary.dto

import java.time.Instant

data class VocabularyQueueDiagnostic(
    val pending: Long,
    val overdue: Long,
    val oldestAgeSeconds: Long?,
)

data class VocabularyDiagnosticsResponse(
    val generatedAt: Instant,
    val memoryProjection: VocabularyQueueDiagnostic,
    val assignmentCallbacks: VocabularyQueueDiagnostic,
    val mediaGeneration: VocabularyQueueDiagnostic,
    val missingMediaObjects: Int,
    val inspectedMediaObjects: Int,
)
