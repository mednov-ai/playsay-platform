package com.playsay.media

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component

data class StoredYoutubeThumbnail(
    val sourceUrl: String,
    val storageKey: String,
    val contentType: String,
    val byteSize: Long,
)

@Component
class YoutubeThumbnailService(
    private val mediaObjectStorage: MediaObjectStorage,
    @param:Value("\${playsay.media-service.max-thumbnail-bytes:5242880}")
    private val maxThumbnailBytes: Long,
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL)
        .connectTimeout(Duration.ofSeconds(10))
        .build(),
) {
    fun store(sourceUrl: String?, storageKey: String?): StoredYoutubeThumbnail? {
        val cleanUrl = sourceUrl?.trim()?.takeIf { value -> value.startsWith("https://") || value.startsWith("http://") } ?: return null
        val cleanStorageKey = storageKey?.trim()?.takeIf { value -> value.isNotBlank() } ?: return null
        val response = runCatching {
            httpClient.send(
                HttpRequest.newBuilder(URI.create(cleanUrl))
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofByteArray(),
            )
        }.getOrElse {
            logger.warn("media-service thumbnail download failed sourceHost={}", safeHost(cleanUrl), it)
            return null
        }
        if (response.statusCode() !in 200..299) {
            logger.warn("media-service thumbnail download returned status={} sourceHost={}", response.statusCode(), safeHost(cleanUrl))
            return null
        }
        val bytes = response.body()
        if (bytes.isEmpty() || bytes.size > maxThumbnailBytes.coerceAtLeast(1)) {
            logger.warn("media-service thumbnail size rejected sourceHost={} byteSize={}", safeHost(cleanUrl), bytes.size)
            return null
        }
        val contentType = response.headers().firstValue(HttpHeaders.CONTENT_TYPE).orElse("image/jpeg")
        return runCatching {
            mediaObjectStorage.putObject(cleanStorageKey, bytes, contentType)
            StoredYoutubeThumbnail(
                sourceUrl = cleanUrl,
                storageKey = cleanStorageKey,
                contentType = contentType,
                byteSize = bytes.size.toLong(),
            )
        }.getOrElse {
            logger.warn("media-service thumbnail storage failed sourceHost={} storageKey={}", safeHost(cleanUrl), cleanStorageKey, it)
            null
        }
    }

    private fun safeHost(value: String): String? =
        runCatching { URI.create(value).host }.getOrNull()

    companion object {
        private val logger = LoggerFactory.getLogger(YoutubeThumbnailService::class.java)
    }
}
