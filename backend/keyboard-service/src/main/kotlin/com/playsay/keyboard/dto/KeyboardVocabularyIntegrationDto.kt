package com.playsay.keyboard.dto

import java.time.Instant

data class KeyboardWeakPatternResponse(
    val subject: String,
    val patterns: Map<String, Int>,
    val evidenceSessions: Int,
)

data class KeyboardVocabularyDiagnosticsResponse(
    val generatedAt: Instant,
    val pendingCallbacks: Long,
    val overdueCallbacks: Long,
    val oldestCallbackAgeSeconds: Long?,
)
