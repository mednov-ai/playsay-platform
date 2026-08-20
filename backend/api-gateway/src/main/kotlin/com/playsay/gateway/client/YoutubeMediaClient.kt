package com.playsay.gateway.client
import com.playsay.gateway.service.YoutubeVideoMeta

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.media.model.YoutubeMetadataRequest
import com.playsay.contract.media.model.YoutubeMetadataResponse
import com.playsay.contract.media.model.YoutubePlaybackSessionRequest
import com.playsay.contract.media.model.YoutubePlaybackSessionResponse
import com.playsay.contract.media.model.YoutubeVideoCacheRequest
import com.playsay.contract.media.model.YoutubeVideoCacheResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.playsay.integration.http.InternalHttpFailure
import com.playsay.integration.http.InternalHttpMethod
import com.playsay.integration.http.InternalHttpResponse
import com.playsay.integration.http.InternalHttpTransport
import java.net.http.HttpClient
import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

interface YoutubeMediaClient {
    fun resolveMetadata(videoId: String): YoutubeVideoMeta?
    fun createPlaybackSession(command: YoutubePlaybackSessionRequest): YoutubePlaybackSessionResponse
    fun cacheVideo(command: YoutubeVideoCacheRequest): YoutubeVideoCacheResponse? = null
    fun deleteVideoCache(videoId: String, quality: String): Boolean = false
}

class YoutubeVideoCacheRejectedException(val reason: String) : RuntimeException(reason)

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
    private val transport = InternalHttpTransport(
        integration = "media-service",
        baseUrl = baseUrl,
        serviceTokenHeader = "X-PlaySay-Media-Service-Token",
        serviceToken = serviceToken,
        httpClient = httpClient,
    )

    override fun resolveMetadata(videoId: String): YoutubeVideoMeta? {
        val response = post(
            path = "/internal/youtube/metadata",
            body = YoutubeMetadataRequest(videoId),
            timeout = Duration.ofSeconds(20),
        ) ?: return null
        if (response.statusCode == HttpStatus.NOT_FOUND.value()) {
            return null
        }
        if (response.statusCode !in 200..299) {
            logger.warn("media-service metadata request failed videoId={} status={}", videoId, response.statusCode)
            return null
        }
        return runCatching {
            objectMapper.readValue(response.body, YoutubeMetadataResponse::class.java)
        }.getOrElse {
            logger.warn("media-service metadata response could not be parsed videoId={} status={}", videoId, response.statusCode, it)
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

    override fun createPlaybackSession(command: YoutubePlaybackSessionRequest): YoutubePlaybackSessionResponse {
        val response = post(
            path = "/internal/youtube/playback-sessions",
            body = command,
            timeout = Duration.ofSeconds(20),
        ) ?: throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        if (response.statusCode !in 200..299) {
            if (response.statusCode == HttpStatus.PAYLOAD_TOO_LARGE.value() || response.statusCode == HttpStatus.UNPROCESSABLE_ENTITY.value()) {
                val reason = runCatching { objectMapper.readTree(response.body).path("code").asText() }
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
                response.statusCode,
            )
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }
        return runCatching {
            objectMapper.readValue(response.body, YoutubePlaybackSessionResponse::class.java)
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

    override fun cacheVideo(command: YoutubeVideoCacheRequest): YoutubeVideoCacheResponse? {
        val response = post(
            path = "/internal/youtube/video-cache",
            body = command,
            timeout = Duration.ofSeconds(cacheRequestTimeoutSeconds.coerceIn(30, 900)),
        ) ?: return null
        if (response.statusCode !in 200..299) {
            logger.warn(
                "media-service cache request failed videoId={} requestedQuality={} status={}",
                command.videoId,
                command.requestedQuality,
                response.statusCode,
            )
            return null
        }
        return runCatching { objectMapper.readValue(response.body, YoutubeVideoCacheResponse::class.java) }
            .getOrElse {
                logger.warn("media-service cache response could not be parsed videoId={}", command.videoId, it)
                null
            }
    }

    override fun deleteVideoCache(videoId: String, quality: String): Boolean {
        val path = "/internal/youtube/video-cache/$videoId?quality=$quality"
        val response = when (val result = transport.exchange(InternalHttpMethod.DELETE, path, timeout = Duration.ofSeconds(30))) {
            is InternalHttpResponse -> result
            is InternalHttpFailure -> {
                logger.warn("media-service cache delete request failed videoId={} quality={} failure={}", videoId, quality, result::class.simpleName)
                return false
            }
        }
        if (response.statusCode !in 200..299) {
            logger.warn("media-service cache delete returned failure videoId={} quality={} status={}", videoId, quality, response.statusCode)
            return false
        }
        return true
    }

    private fun post(path: String, body: Any, timeout: Duration): InternalHttpResponse? =
        when (
            val result = transport.exchange(
                method = InternalHttpMethod.POST,
                path = path,
                body = objectMapper.writeValueAsString(body),
                contentType = "application/json",
                timeout = timeout,
            )
        ) {
            is InternalHttpResponse -> result
            is InternalHttpFailure -> {
                logger.warn("media-service request failed path={} failure={}", path, result::class.simpleName)
                null
            }
        }

    companion object {
        private val logger = LoggerFactory.getLogger(HttpYoutubeMediaClient::class.java)
    }
}
