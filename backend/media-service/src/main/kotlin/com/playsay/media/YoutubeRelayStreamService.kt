package com.playsay.media

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@Component
class YoutubeRelayStreamService(
    private val sessionStore: YoutubePlaybackSessionStore,
    @param:Value("\${playsay.media-service.max-upstream-range-bytes:1048576}")
    private val maxUpstreamRangeBytes: Long = DEFAULT_MAX_UPSTREAM_RANGE_BYTES,
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL)
        .connectTimeout(Duration.ofSeconds(10))
        .build(),
) {
    fun stream(sessionId: UUID, rangeHeader: String?): ResponseEntity<StreamingResponseBody> {
        val session = sessionStore.find(sessionId)
            ?: throw MediaServiceException(HttpStatus.NOT_FOUND, "VIDEO_PLAYBACK_SESSION_NOT_FOUND")
        val upstreamRangeHeader = boundedRangeHeader(rangeHeader)
        val requestBuilder = HttpRequest.newBuilder(URI.create(session.upstreamUrl))
            .timeout(Duration.ofSeconds(20))
            .GET()
        upstreamRangeHeader?.let { range -> requestBuilder.header(HttpHeaders.RANGE, range) }

        val upstreamResponse = runCatching {
            httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofInputStream())
        }.getOrElse {
            logger.warn(
                "media-service stream upstream request failed sessionId={} materialId={} blockId={} videoId={} rangeHeader={} upstreamRangeHeader={}",
                session.id,
                session.materialId,
                session.blockId,
                session.videoId,
                sanitizedRange(rangeHeader),
                upstreamRangeHeader,
                it,
            )
            throw MediaServiceException(HttpStatus.SERVICE_UNAVAILABLE, "YOUTUBE_RELAY_UNAVAILABLE")
        }

        val upstreamHeaders = upstreamResponse.headers()
        logger.info(
            "media-service stream response sessionId={} materialId={} blockId={} videoId={} status={} rangeHeader={} upstreamRangeHeader={} rangeLimited={} contentType={} contentLength={} contentRange={} acceptRanges={} selectedQuality={} selectedHeight={}",
            session.id,
            session.materialId,
            session.blockId,
            session.videoId,
            upstreamResponse.statusCode(),
            sanitizedRange(rangeHeader),
            upstreamRangeHeader,
            upstreamRangeHeader != sanitizedRange(rangeHeader),
            upstreamHeaders.firstValue(HttpHeaders.CONTENT_TYPE).orElse(null),
            upstreamHeaders.firstValue(HttpHeaders.CONTENT_LENGTH).orElse(null),
            upstreamHeaders.firstValue(HttpHeaders.CONTENT_RANGE).orElse(null),
            upstreamHeaders.firstValue(HttpHeaders.ACCEPT_RANGES).orElse(null),
            session.selectedQuality,
            session.selectedHeight,
        )

        val headers = HttpHeaders()
        headers.setCacheControl(CacheControl.noStore())
        headers["X-Accel-Buffering"] = "no"
        copyHeader(upstreamResponse, headers, HttpHeaders.CONTENT_TYPE)
        copyHeader(upstreamResponse, headers, HttpHeaders.CONTENT_LENGTH)
        copyHeader(upstreamResponse, headers, HttpHeaders.CONTENT_RANGE)
        copyHeader(upstreamResponse, headers, HttpHeaders.ACCEPT_RANGES)

        val body = StreamingResponseBody { output ->
            upstreamResponse.body().use { input -> input.copyTo(output) }
        }

        return ResponseEntity.status(upstreamResponse.statusCode())
            .headers(headers)
            .body(body)
    }

    private fun copyHeader(
        response: HttpResponse<*>,
        headers: HttpHeaders,
        headerName: String,
    ) {
        response.headers().firstValue(headerName).ifPresent { value -> headers[headerName] = value }
    }

    private fun sanitizedRange(rangeHeader: String?): String? =
        rangeHeader?.trim()?.takeIf { range -> range.startsWith("bytes=") }?.take(64)

    private fun boundedRangeHeader(rangeHeader: String?): String? {
        val maxBytes = maxUpstreamRangeBytes.coerceAtLeast(1)
        val cleanRange = rangeHeader?.trim()?.takeIf { range -> range.startsWith("bytes=") }
        if (cleanRange.isNullOrBlank()) {
            return "bytes=0-${maxBytes - 1}"
        }

        val match = singleRangePattern.matchEntire(cleanRange) ?: return cleanRange.take(64)
        val startText = match.groupValues[1]
        if (startText.isBlank()) {
            return cleanRange.take(64)
        }

        val start = startText.toLongOrNull() ?: return cleanRange.take(64)
        val requestedEnd = match.groupValues[2].takeIf { value -> value.isNotBlank() }?.toLongOrNull()
        if (requestedEnd != null && requestedEnd < start) {
            return cleanRange.take(64)
        }

        val maxEnd = if (Long.MAX_VALUE - start < maxBytes - 1) {
            Long.MAX_VALUE
        } else {
            start + maxBytes - 1
        }
        val boundedEnd = requestedEnd?.coerceAtMost(maxEnd) ?: maxEnd
        return "bytes=$start-$boundedEnd"
    }

    companion object {
        private const val DEFAULT_MAX_UPSTREAM_RANGE_BYTES = 1_048_576L
        private val singleRangePattern = Regex("^bytes=(\\d*)-(\\d*)$")
        private val logger = LoggerFactory.getLogger(YoutubeRelayStreamService::class.java)
    }
}
