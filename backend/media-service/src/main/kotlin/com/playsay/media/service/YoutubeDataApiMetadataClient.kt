package com.playsay.media.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

data class YoutubeLookupMetadata(
    val videoId: String,
    val durationSeconds: Int?,
    val language: String?,
    val thumbnailUrl: String?,
)

@Component
class YoutubeDataApiMetadataClient(
    @param:Value("\${playsay.media-service.youtube-data-api-key:}")
    private val apiKey: String = "",
    @param:Value("\${playsay.media-service.youtube-data-api-base-url:https://www.googleapis.com/youtube/v3}")
    private val baseUrl: String = "https://www.googleapis.com/youtube/v3",
    @param:Value("\${playsay.media-service.youtube-data-api-timeout-seconds:8}")
    private val timeoutSeconds: Long = 8,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(3))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build(),
) {
    fun resolve(videoId: String): YoutubeLookupMetadata? {
        val key = apiKey.trim()
        if (key.isEmpty()) {
            return null
        }
        val startedAt = System.nanoTime()
        val response = runCatching {
            httpClient.send(
                HttpRequest.newBuilder(endpoint(videoId, key))
                    .timeout(Duration.ofSeconds(timeoutSeconds.coerceIn(1, 30)))
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString(),
            )
        }.getOrElse {
            logger.warn(
                "YouTube Data API metadata request failed videoId={} failureType={} durationMs={}",
                videoId,
                it.javaClass.simpleName,
                elapsedMs(startedAt),
            )
            return null
        }
        if (response.statusCode() !in 200..299) {
            logger.warn(
                "YouTube Data API metadata request returned failure videoId={} status={} durationMs={}",
                videoId,
                response.statusCode(),
                elapsedMs(startedAt),
            )
            return null
        }
        val root = runCatching { objectMapper.readTree(response.body()) }.getOrElse {
            logger.warn("YouTube Data API metadata response could not be parsed videoId={} durationMs={}", videoId, elapsedMs(startedAt), it)
            return null
        }
        val item = root.path("items")
            .takeIf(JsonNode::isArray)
            ?.firstOrNull { candidate -> candidate.path("id").asText(null) == videoId }
            ?: return null
        val metadata = YoutubeLookupMetadata(
            videoId = videoId,
            durationSeconds = parseDuration(item.path("contentDetails").path("duration").asText(null)),
            language = cleanText(item.path("snippet").path("defaultAudioLanguage")),
            thumbnailUrl = bestThumbnail(item.path("snippet").path("thumbnails")),
        )
        logger.info(
            "YouTube Data API resolved metadata videoId={} durationSeconds={} language={} thumbnailPresent={} durationMs={}",
            videoId,
            metadata.durationSeconds,
            metadata.language,
            metadata.thumbnailUrl != null,
            elapsedMs(startedAt),
        )
        return metadata
    }

    private fun endpoint(videoId: String, key: String): URI {
        fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)
        return URI.create(
            "${baseUrl.trimEnd('/')}/videos?part=contentDetails%2Csnippet&id=${encode(videoId)}&key=${encode(key)}",
        )
    }

    private fun parseDuration(value: String?): Int? =
        value
            ?.let { raw -> runCatching { Duration.parse(raw).seconds }.getOrNull() }
            ?.takeIf { seconds -> seconds in 1..Int.MAX_VALUE.toLong() }
            ?.toInt()

    private fun bestThumbnail(thumbnails: JsonNode): String? =
        thumbnails.properties().asSequence()
            .mapNotNull { (_, thumbnail) ->
                val url = cleanText(thumbnail.path("url")) ?: return@mapNotNull null
                (thumbnail.path("width").takeIf(JsonNode::isNumber)?.asInt() ?: 0) to url
            }
            .maxByOrNull { (width, _) -> width }
            ?.second

    private fun cleanText(node: JsonNode): String? =
        node.takeIf(JsonNode::isTextual)?.asText()?.trim()?.takeIf(String::isNotEmpty)

    private fun elapsedMs(startedAt: Long): Long = Duration.ofNanos(System.nanoTime() - startedAt).toMillis()

    companion object {
        private val logger = LoggerFactory.getLogger(YoutubeDataApiMetadataClient::class.java)
    }
}

@Component
class YoutubeMetadataLookupService(
    private val dataApiClient: YoutubeDataApiMetadataClient,
    private val ytDlpResolver: YoutubeMetadataResolver,
) {
    fun resolve(videoId: String): YoutubeResolvedVideo? {
        val dataApi = dataApiClient.resolve(videoId)
        if (dataApi?.durationSeconds != null && dataApi.language != null) {
            return dataApi.toResolvedVideo()
        }
        val ytDlp = ytDlpResolver.resolve(videoId)
        if (dataApi == null) {
            return ytDlp
        }
        return YoutubeResolvedVideo(
            videoId = videoId,
            durationSeconds = dataApi.durationSeconds ?: ytDlp?.durationSeconds,
            language = dataApi.language ?: ytDlp?.language,
            thumbnailUrl = dataApi.thumbnailUrl ?: ytDlp?.thumbnailUrl,
            formats = emptyList(),
        )
    }

    private fun YoutubeLookupMetadata.toResolvedVideo(): YoutubeResolvedVideo =
        YoutubeResolvedVideo(videoId, durationSeconds, language, thumbnailUrl, emptyList())
}
