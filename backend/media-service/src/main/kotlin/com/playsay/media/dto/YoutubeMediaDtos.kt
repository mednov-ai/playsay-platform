package com.playsay.media.dto

import java.util.UUID

data class YoutubeMetadataRequest(
    val videoId: String,
)

data class YoutubeMetadataResponse(
    val videoId: String,
    val durationSeconds: Int?,
    val language: String?,
    val thumbnailUrl: String?,
)

data class YoutubePlaybackSessionRequest(
    val subject: String,
    val materialId: UUID,
    val blockId: String,
    val videoId: String,
    val requestedQuality: String?,
    val thumbnailStorageKey: String?,
)

data class YoutubePlaybackSessionResponse(
    val sessionId: UUID,
    val expiresAt: String,
    val requestedQuality: String,
    val selectedQuality: String,
    val selectedHeight: Int?,
    val thumbnailSourceUrl: String?,
    val thumbnailStored: Boolean,
    val thumbnailContentType: String?,
    val thumbnailByteSize: Long?,
)
