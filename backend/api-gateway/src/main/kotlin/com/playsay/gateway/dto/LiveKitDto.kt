package com.playsay.gateway.dto

import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

data class LiveKitRoomTokenResponse(
    val serverUrl: String,
    val token: String,
    val roomName: String,
    val identity: String,
    val expiresAt: Instant,
    val lessonTranslationAllowed: Boolean = false,
    val mediaRouting: MediaRoutingResponse? = null,
)

data class MediaRoutingResponse(
    @field:Schema(allowableValues = ["REGIONAL_RELAY"])
    val policy: String,
    @field:Schema(allowableValues = ["selectel-rf-v1"])
    val revision: String,
    @field:Schema(allowableValues = ["relay"])
    val iceTransportPolicy: String,
    @field:ArraySchema(minItems = 1, maxItems = 1)
    val iceServers: List<MediaRoutingIceServerResponse>,
    val expiresAt: Instant,
)

data class MediaRoutingIceServerResponse(
    @field:ArraySchema(minItems = 1, maxItems = 3)
    val urls: List<String>,
    @field:Schema(minLength = 3, maxLength = 128)
    val username: String,
    @field:Schema(minLength = 20, maxLength = 128)
    val credential: String,
)

data class LessonTranslationSessionResponse(
    val clientSecret: String,
    val expiresAt: Instant?,
    val model: String,
    val callsUrl: String,
    val targetLanguage: String,
    val sourceParticipantIdentity: String,
)
