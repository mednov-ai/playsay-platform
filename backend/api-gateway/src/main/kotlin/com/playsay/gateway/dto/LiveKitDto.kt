package com.playsay.gateway.dto

import java.time.Instant

data class LiveKitRoomTokenResponse(
    val serverUrl: String,
    val token: String,
    val roomName: String,
    val identity: String,
    val expiresAt: Instant,
)
