package com.playsay.gateway.dto

import java.time.Instant

data class LiveKitRoomTokenResponse(
    val serverUrl: String,
    val token: String,
    val roomName: String,
    val identity: String,
    val expiresAt: Instant,
    val lessonTranslationAllowed: Boolean = false,
)

data class LessonTranslationSessionResponse(
    val clientSecret: String,
    val expiresAt: Instant?,
    val model: String,
    val callsUrl: String,
    val targetLanguage: String,
    val sourceParticipantIdentity: String,
)
