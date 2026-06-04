package com.playsay.gateway.service

import java.time.Duration
import java.util.concurrent.TimeUnit
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class YoutubeVideoMetadataResolver(
    @param:Value("\${playsay.video.youtube.rf-relay.ytdlp-path:yt-dlp}")
    private val ytdlpPath: String,
) {
    fun resolve(videoId: String): YoutubeVideoMeta? {
        val startedAt = System.nanoTime()
        val process = runCatching {
            ProcessBuilder(
                ytdlpPath,
                "--no-playlist",
                "--skip-download",
                "--no-warnings",
                "--print",
                "%(id)s",
                "--print",
                "%(duration)s",
                "--print",
                "%(language)s",
                "https://www.youtube.com/watch?v=$videoId",
            )
                .start()
        }.getOrElse {
            logger.warn("YouTube RF relay metadata yt-dlp start failed videoId={} ytdlpPath={}", videoId, ytdlpPath, it)
            return null
        }

        val finished = process.waitFor(20, TimeUnit.SECONDS)
        val durationMs = Duration.ofNanos(System.nanoTime() - startedAt).toMillis()
        if (!finished) {
            process.destroyForcibly()
            logger.warn("YouTube RF relay metadata yt-dlp timed out videoId={} durationMs={}", videoId, durationMs)
            return null
        }

        val stdout = process.inputStream.bufferedReader().use { reader -> reader.readText() }
        val stderr = process.errorStream.bufferedReader().use { reader -> reader.readText() }
        if (process.exitValue() != 0) {
            logger.warn(
                "YouTube RF relay metadata yt-dlp failed videoId={} exitCode={} durationMs={} stdoutLines={} stderrLines={}",
                videoId,
                process.exitValue(),
                durationMs,
                stdout.lineSequence().count(),
                stderr.lineSequence().count(),
            )
            return null
        }

        val lines = stdout.lineSequence().map { line -> line.trim() }.filter { line -> line.isNotBlank() }.toList()
        if (lines.size < 3) {
            logger.warn(
                "YouTube RF relay metadata yt-dlp returned incomplete metadata videoId={} durationMs={} stdoutLines={} stderrLines={}",
                videoId,
                durationMs,
                lines.size,
                stderr.lineSequence().count(),
            )
            return null
        }

        val resolvedId = nullablePrintValue(lines[0])
        if (resolvedId != videoId) {
            logger.warn(
                "YouTube RF relay metadata yt-dlp id mismatch requestedVideoId={} resolvedVideoId={} durationMs={}",
                videoId,
                resolvedId,
                durationMs,
            )
            return null
        }

        val durationSeconds = nullablePrintValue(lines[1])?.toDoubleOrNull()?.toInt()
        val language = nullablePrintValue(lines[2])
        logger.info(
            "YouTube RF relay metadata resolved videoId={} durationSeconds={} language={} durationPresent={} languagePresent={} durationMs={}",
            videoId,
            durationSeconds,
            language,
            durationSeconds != null,
            language != null,
            durationMs,
        )
        return YoutubeVideoMeta(
            videoId = videoId,
            durationSeconds = durationSeconds,
            language = language,
        )
    }

    private fun nullablePrintValue(value: String?): String? =
        value?.trim()?.takeIf { cleanValue -> cleanValue.isNotBlank() && cleanValue != "NA" && cleanValue != "None" && cleanValue != "null" }

    companion object {
        private val logger = LoggerFactory.getLogger(YoutubeVideoMetadataResolver::class.java)
    }
}
