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
}

data class YoutubeMediaPlaybackSessionCommand(
    val subject: String,
    val materialId: UUID,
    val blockId: String,
    val videoId: String,
    val requestedQuality: String,
    val thumbnailStorageKey: String?,
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
)

@Component
class HttpYoutubeMediaClient(
    @param:Value("\${playsay.media-service.base-url:http://media-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.media-service.service-token:}")
    private val serviceToken: String,
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
        ) ?: throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        if (response.statusCode() !in 200..299) {
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

    private fun post(path: String, body: Any): HttpResponse<String>? {
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
                    .timeout(Duration.ofSeconds(20))
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
