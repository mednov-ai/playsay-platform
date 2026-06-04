package com.playsay.media.controller

import com.playsay.media.dto.YoutubeMetadataRequest
import com.playsay.media.dto.YoutubeMetadataResponse
import com.playsay.media.dto.YoutubePlaybackSessionRequest
import com.playsay.media.dto.YoutubePlaybackSessionResponse
import com.playsay.media.service.MediaInternalAuth
import com.playsay.media.service.MediaServiceException
import com.playsay.media.service.YoutubeMetadataResolver
import com.playsay.media.service.YoutubePlaybackQuality
import com.playsay.media.service.YoutubePlaybackSessionStore
import com.playsay.media.service.YoutubeQualitySelector
import com.playsay.media.service.YoutubeRelayStreamService
import com.playsay.media.service.YoutubeThumbnailService
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@RestController
class MediaController(
    private val metadataResolver: YoutubeMetadataResolver,
    private val sessionStore: YoutubePlaybackSessionStore,
    private val streamService: YoutubeRelayStreamService,
    private val thumbnailService: YoutubeThumbnailService,
    private val internalAuth: MediaInternalAuth,
    @param:Value("\${playsay.media-service.session-ttl-seconds:900}")
    private val sessionTtlSeconds: Long,
) {
    @PostMapping(
        "/internal/youtube/metadata",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun metadata(
        @RequestHeader("X-PlaySay-Media-Service-Token", required = false) serviceToken: String?,
        @RequestBody request: YoutubeMetadataRequest,
    ): YoutubeMetadataResponse {
        internalAuth.requireValid(serviceToken)
        val metadata = metadataResolver.resolve(request.videoId)
            ?: throw MediaServiceException(HttpStatus.NOT_FOUND, "YOUTUBE_METADATA_NOT_FOUND")
        return YoutubeMetadataResponse(
            videoId = metadata.videoId,
            durationSeconds = metadata.durationSeconds,
            language = metadata.language,
            thumbnailUrl = metadata.thumbnailUrl,
        )
    }

    @PostMapping(
        "/internal/youtube/playback-sessions",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun createPlaybackSession(
        @RequestHeader("X-PlaySay-Media-Service-Token", required = false) serviceToken: String?,
        @RequestBody request: YoutubePlaybackSessionRequest,
    ): YoutubePlaybackSessionResponse {
        internalAuth.requireValid(serviceToken)
        val requestedQuality = YoutubePlaybackQuality.normalized(request.requestedQuality)
        val metadata = metadataResolver.resolve(request.videoId)
            ?: throw MediaServiceException(HttpStatus.SERVICE_UNAVAILABLE, "YOUTUBE_RELAY_UNAVAILABLE")
        val selected = YoutubeQualitySelector.select(metadata.formats, requestedQuality)
            ?: throw MediaServiceException(HttpStatus.SERVICE_UNAVAILABLE, "YOUTUBE_RELAY_UNAVAILABLE")
        val thumbnail = thumbnailService.store(metadata.thumbnailUrl, request.thumbnailStorageKey)
        val session = sessionStore.create(
            subject = request.subject,
            materialId = request.materialId,
            blockId = request.blockId,
            videoId = request.videoId,
            upstreamUrl = selected.upstreamUrl,
            requestedQuality = requestedQuality,
            selectedQuality = selected.selectedQuality,
            selectedHeight = selected.height,
            ttlSeconds = sessionTtlSeconds,
        )
        return YoutubePlaybackSessionResponse(
            sessionId = session.id,
            expiresAt = session.expiresAt.toString(),
            requestedQuality = requestedQuality.name,
            selectedQuality = selected.selectedQuality.name,
            selectedHeight = selected.height,
            thumbnailSourceUrl = metadata.thumbnailUrl,
            thumbnailStored = thumbnail != null,
            thumbnailContentType = thumbnail?.contentType,
            thumbnailByteSize = thumbnail?.byteSize,
        )
    }

    @GetMapping("/video-playback-sessions/{sessionId}/stream")
    fun stream(
        @PathVariable sessionId: UUID,
        @RequestHeader(HttpHeaders.RANGE, required = false) rangeHeader: String?,
    ): ResponseEntity<StreamingResponseBody> =
        streamService.stream(sessionId, rangeHeader)
}
