package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
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
    @param:Value("\${playsay.video.youtube.rf-relay.ytdlp-path:yt-dlp}")
    private val ytdlpPath: String,
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL)
        .connectTimeout(Duration.ofSeconds(10))
        .build(),
    private val clock: Clock = Clock.systemUTC(),
) {
    private val upstreamUrlCache = ConcurrentHashMap<UUID, CachedUpstreamUrl>()

    fun stream(session: YoutubePlaybackSession, rangeHeader: String?): ResponseEntity<StreamingResponseBody> {
        val upstreamUrl = cachedUpstreamUrl(session)
        val requestBuilder = HttpRequest.newBuilder(URI.create(upstreamUrl))
            .timeout(Duration.ofSeconds(20))
            .GET()
        rangeHeader?.trim()?.takeIf { value -> value.startsWith("bytes=") }?.let { range ->
            requestBuilder.header(HttpHeaders.RANGE, range)
        }

        val upstreamResponse = runCatching {
            httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofInputStream())
        }.getOrElse {
            logger.warn(
                "YouTube RF relay upstream request failed sessionId={} materialId={} blockId={} videoId={} rangeHeader={} rangePresent={}",
                session.id,
                session.materialId,
                session.blockId,
                session.videoId,
                sanitizedRange(rangeHeader),
                !rangeHeader.isNullOrBlank(),
                it,
            )
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }

        val upstreamHeaders = upstreamResponse.headers()
        logger.info(
            "YouTube RF relay stream response sessionId={} materialId={} blockId={} videoId={} status={} rangeHeader={} rangePresent={} contentType={} contentLength={} contentRange={} acceptRanges={}",
            session.id,
            session.materialId,
            session.blockId,
            session.videoId,
            upstreamResponse.statusCode(),
            sanitizedRange(rangeHeader),
            !rangeHeader.isNullOrBlank(),
            upstreamHeaders.firstValue(HttpHeaders.CONTENT_TYPE).orElse(null),
            upstreamHeaders.firstValue(HttpHeaders.CONTENT_LENGTH).orElse(null),
            upstreamHeaders.firstValue(HttpHeaders.CONTENT_RANGE).orElse(null),
            upstreamHeaders.firstValue(HttpHeaders.ACCEPT_RANGES).orElse(null),
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

    private fun cachedUpstreamUrl(session: YoutubePlaybackSession): String {
        val now = clock.instant()
        upstreamUrlCache.entries.removeIf { (_, cached) -> !cached.expiresAt.isAfter(now) }
        upstreamUrlCache[session.id]?.takeIf { cached -> cached.expiresAt.isAfter(now) }?.let { cached ->
            logger.info(
                "YouTube RF relay upstream cache hit sessionId={} materialId={} blockId={} videoId={} remainingSeconds={}",
                session.id,
                session.materialId,
                session.blockId,
                session.videoId,
                Duration.between(now, cached.expiresAt).seconds.coerceAtLeast(0),
            )
            return cached.url
        }

        val resolvedUrl = resolveUpstreamUrl(session.videoId)
        upstreamUrlCache[session.id] = CachedUpstreamUrl(url = resolvedUrl, expiresAt = session.expiresAt)
        logger.info(
            "YouTube RF relay resolved upstream for sessionId={} materialId={} blockId={} videoId={} expiresAt={}",
            session.id,
            session.materialId,
            session.blockId,
            session.videoId,
            session.expiresAt,
        )
        return resolvedUrl
    }

    private fun resolveUpstreamUrl(videoId: String): String {
        val startedAt = System.nanoTime()
        val process = runCatching {
            ProcessBuilder(
                ytdlpPath,
                "--no-playlist",
                "-f",
                "best[protocol^=http][acodec!=none][vcodec!=none]/best",
                "-g",
                "https://www.youtube.com/watch?v=$videoId",
            )
                .redirectErrorStream(true)
                .start()
        }.getOrElse {
            logger.warn("YouTube RF relay yt-dlp start failed videoId={} ytdlpPath={}", videoId, ytdlpPath, it)
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }

        val output = process.inputStream.bufferedReader().use { reader -> reader.readText() }
        val finished = process.waitFor(15, java.util.concurrent.TimeUnit.SECONDS)
        val durationMs = Duration.ofNanos(System.nanoTime() - startedAt).toMillis()
        if (!finished) {
            process.destroyForcibly()
            logger.warn(
                "YouTube RF relay yt-dlp timed out videoId={} durationMs={} outputChars={} outputLines={}",
                videoId,
                durationMs,
                output.length,
                output.lineSequence().count(),
            )
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }
        if (process.exitValue() != 0) {
            logger.warn(
                "YouTube RF relay yt-dlp failed videoId={} exitCode={} durationMs={} outputChars={} outputLines={}",
                videoId,
                process.exitValue(),
                durationMs,
                output.length,
                output.lineSequence().count(),
            )
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }

        val resolvedUrl = output.lineSequence()
            .map { line -> line.trim() }
            .firstOrNull { line -> line.startsWith("https://") || line.startsWith("http://") }
        if (resolvedUrl == null) {
            logger.warn(
                "YouTube RF relay yt-dlp returned no media url videoId={} durationMs={} outputChars={} outputLines={}",
                videoId,
                durationMs,
                output.length,
                output.lineSequence().count(),
            )
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }
        logger.info(
            "YouTube RF relay yt-dlp resolved media url videoId={} durationMs={} outputChars={} outputLines={}",
            videoId,
            durationMs,
            output.length,
            output.lineSequence().count(),
        )
        return resolvedUrl
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

    companion object {
        private val logger = LoggerFactory.getLogger(YoutubeRelayStreamService::class.java)
    }
}

private data class CachedUpstreamUrl(
    val url: String,
    val expiresAt: Instant,
)
