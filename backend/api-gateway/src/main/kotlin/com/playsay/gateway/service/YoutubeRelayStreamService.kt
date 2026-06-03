package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
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
) {
    fun stream(session: YoutubePlaybackSession, rangeHeader: String?): ResponseEntity<StreamingResponseBody> {
        val upstreamUrl = resolveUpstreamUrl(session.videoId)
        val requestBuilder = HttpRequest.newBuilder(URI.create(upstreamUrl))
            .timeout(Duration.ofSeconds(20))
            .GET()
        rangeHeader?.trim()?.takeIf { value -> value.startsWith("bytes=") }?.let { range ->
            requestBuilder.header(HttpHeaders.RANGE, range)
        }

        val upstreamResponse = runCatching {
            httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofInputStream())
        }.getOrElse {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }

        val headers = HttpHeaders()
        headers.setCacheControl(CacheControl.noStore())
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

    private fun resolveUpstreamUrl(videoId: String): String {
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
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }

        val output = process.inputStream.bufferedReader().use { reader -> reader.readText() }
        val finished = process.waitFor(15, java.util.concurrent.TimeUnit.SECONDS)
        if (!finished) {
            process.destroyForcibly()
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }
        if (process.exitValue() != 0) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
        }

        return output.lineSequence()
            .map { line -> line.trim() }
            .firstOrNull { line -> line.startsWith("https://") || line.startsWith("http://") }
            ?: throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.YOUTUBE_RELAY_UNAVAILABLE)
    }

    private fun copyHeader(
        response: HttpResponse<*>,
        headers: HttpHeaders,
        headerName: String,
    ) {
        response.headers().firstValue(headerName).ifPresent { value -> headers[headerName] = value }
    }
}
