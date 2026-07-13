package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

interface YoutubeMediaClient {
    fun resolveMetadata(videoId: String): YoutubeVideoMeta?
    fun createPlaybackSession(command: YoutubeMediaPlaybackSessionCommand): YoutubeMediaPlaybackSessionResult
    fun cacheVideo(command: YoutubeVideoCacheCommand): YoutubeVideoCacheResult? = null
    fun deleteVideoCache(videoId: String, quality: String): Boolean = false
}

class YoutubeVideoCacheRejectedException(val reason: String) : RuntimeException(reason)

data class YoutubeMediaPlaybackSessionCommand(
    val subject: String,
    val materialId: UUID,
    val blockId: String,
    val videoId: String,
    val requestedQuality: String,
    val thumbnailStorageKey: String?,
    val thumbnailSourceUrl: String? = null,
)

data class YoutubeMediaPlaybackSessionResult(
    val sessionId: UUID,
    val expiresAt: Instant,
    val requestedQuality: String,
    val selectedQuality: String,
    val selectedHeight: Int?,
    val thumbnailSourceUrl: String?,
    val thumbnailStored: Boolean,
    val thumbnailContentType: String?,
    val thumbnailByteSize: Long?,
    val deliverySource: String = "YOUTUBE_RELAY",
)

data class YoutubeVideoCacheCommand(
    val videoId: String,
    val requestedQuality: String,
)

data class YoutubeVideoCacheResult(
    val videoId: String,
    val status: String,
    val storageKey: String,
    val requestedQuality: String,
    val selectedQuality: String,
    val selectedHeight: Int?,
    val contentType: String,
    val byteSize: Long,
    val durationSeconds: Int?,
    val language: String?,
    val thumbnailUrl: String?,
)

@Component
class HttpYoutubeMediaClient(
    @param:Value("\${playsay.media-service.base-url:http://media-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.media-service.service-token:}")
    private val serviceToken: String,
    @param:Value("\${playsay.media-service.cache-request-timeout-seconds:660}")
    private val cacheRequestTimeoutSeconds: Long,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build(),
) : YoutubeMediaClient {
    override fun resolveMetadata(videoId: String): YoutubeVideoMeta? {
        val response = post(
            path = "/internal/youtube/metadata",
            body = mapOf("videoId" to videoId),
            timeout = Duration.ofSeconds(20),
        ) ?: return null
        if (response.statusCode() == HttpStatus.NOT_FOUND.value()) {
            return null
        }
        if (response.statusCode() !in 200..299) {
            logger.warn("media-service metadata request failed videoId={} status={}", videoId, response.statusCode())
            return null
        }
        return runCatching {
            objectMapper.readValue(response.body(), YoutubeMediaMetadataEnvelope::class.java)
        }.getOrElse {
            logger.warn("media-service metadata response could not be parsed videoId={} status={}", videoId, response.statusCode(), it)
            null
        }?.let { metadata ->
            YoutubeVideoMeta(
                videoId = metadata.videoId,
                durationSeconds = metadata.durationSeconds,
                language = metadata.language,
                thumbnailUrl = metadata.thumbnailUrl,
            )
        }
    }

    override fun createPlaybackSession(command: YoutubeMediaPlaybackSessionCommand): YoutubeMediaPlaybackSessionResult {
        val response = post(
            path = "/internal/youtube/playback-sessions",
            body = command,
            timeout = Duration.ofSeconds(20),
        ) ?: throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        if (response.statusCode() !in 200..299) {
            if (response.statusCode() == HttpStatus.PAYLOAD_TOO_LARGE.value() || response.statusCode() == HttpStatus.UNPROCESSABLE_ENTITY.value()) {
                val reason = runCatching { objectMapper.readTree(response.body()).path("code").asText() }
                    .getOrNull()
                    ?.takeIf { code -> code.isNotBlank() }
                    ?: "YOUTUBE_CACHE_REJECTED"
                throw YoutubeVideoCacheRejectedException(reason)
            }
            logger.warn(
                "media-service playback session request failed materialId={} blockId={} videoId={} requestedQuality={} status={}",
                command.materialId,
                command.blockId,
                command.videoId,
                command.requestedQuality,
                response.statusCode(),
            )
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }
        return runCatching {
            objectMapper.readValue(response.body(), YoutubeMediaPlaybackSessionResult::class.java)
        }.getOrElse {
            logger.warn(
                "media-service playback session response could not be parsed materialId={} blockId={} videoId={} requestedQuality={}",
                command.materialId,
                command.blockId,
                command.videoId,
                command.requestedQuality,
                it,
            )
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }
    }

    override fun cacheVideo(command: YoutubeVideoCacheCommand): YoutubeVideoCacheResult? {
        val response = post(
            path = "/internal/youtube/video-cache",
            body = command,
            timeout = Duration.ofSeconds(cacheRequestTimeoutSeconds.coerceIn(30, 900)),
        ) ?: return null
        if (response.statusCode() !in 200..299) {
            logger.warn(
                "media-service cache request failed videoId={} requestedQuality={} status={}",
                command.videoId,
                command.requestedQuality,
                response.statusCode(),
            )
            return null
        }
        return runCatching { objectMapper.readValue(response.body(), YoutubeVideoCacheResult::class.java) }
            .getOrElse {
                logger.warn("media-service cache response could not be parsed videoId={}", command.videoId, it)
                null
            }
    }

    override fun deleteVideoCache(videoId: String, quality: String): Boolean {
        val token = serviceToken.trim()
        if (token.isEmpty()) {
            return false
        }
        val endpoint = baseUrl.trimEnd('/') + "/internal/youtube/video-cache/$videoId?quality=$quality"
        val response = runCatching {
            httpClient.send(
                HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(30))
                    .header("X-PlaySay-Media-Service-Token", token)
                    .method("D" + "ELETE", HttpRequest.BodyPublishers.noBody())
                    .build(),
                HttpResponse.BodyHandlers.ofString(),
            )
        }.getOrElse {
            logger.warn("media-service cache delete request failed videoId={} quality={}", videoId, quality, it)
            return false
        }
        if (response.statusCode() !in 200..299) {
            logger.warn("media-service cache delete returned failure videoId={} quality={} status={}", videoId, quality, response.statusCode())
            return false
        }
        return true
    }

    private fun post(path: String, body: Any, timeout: Duration): HttpResponse<String>? {
        val token = serviceToken.trim()
        if (token.isEmpty()) {
            logger.warn("media-service token is not configured path={}", path)
            return null
        }
        val endpoint = baseUrl.trimEnd('/') + path
        val payload = objectMapper.writeValueAsBytes(body)
        return runCatching {
            httpClient.send(
                HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(timeout)
                    .header(HttpHeaders.CONTENT_TYPE, "application/json")
                    .header("X-PlaySay-Media-Service-Token", token)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(payload))
                    .build(),
                HttpResponse.BodyHandlers.ofString(),
            )
        }.getOrElse {
            logger.warn("media-service request failed path={}", path, it)
            null
        }
    }

    companion object {
        private val logger = LoggerFactory.getLogger(HttpYoutubeMediaClient::class.java)
    }
}

private data class YoutubeMediaMetadataEnvelope(
    val videoId: String,
    val durationSeconds: Int?,
    val language: String?,
    val thumbnailUrl: String?,
)
