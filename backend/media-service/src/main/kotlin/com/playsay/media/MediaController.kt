package com.playsay.media

import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
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

@RestController
class HealthController {
    @GetMapping("/healthz")
    fun health(): Map<String, String> = mapOf("status" to "ok")
}

class MediaInternalAuth(
    private val serviceToken: String,
) {
    fun requireValid(value: String?) {
        val expected = serviceToken.trim()
        if (expected.length < 16 || value?.trim() != expected) {
            throw MediaServiceException(HttpStatus.UNAUTHORIZED, "MEDIA_SERVICE_TOKEN_REQUIRED")
        }
    }
}

@org.springframework.context.annotation.Configuration
class MediaInternalAuthConfig {
    @org.springframework.context.annotation.Bean
    fun mediaInternalAuth(
        @Value("\${playsay.media-service.service-token:}") serviceToken: String,
    ): MediaInternalAuth = MediaInternalAuth(serviceToken)
}

@ControllerAdvice
class MediaExceptionHandler {
    @ExceptionHandler(MediaServiceException::class)
    fun handle(exception: MediaServiceException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(exception.status).body(mapOf("code" to exception.code))
}
