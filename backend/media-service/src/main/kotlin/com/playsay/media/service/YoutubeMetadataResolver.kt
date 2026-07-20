package com.playsay.media.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.io.InputStream
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

data class YoutubeResolvedVideo(
    val videoId: String,
    val durationSeconds: Int?,
    val language: String?,
    val thumbnailUrl: String?,
    val formats: List<YoutubeFormat>,
)

@Component
class YoutubeMetadataResolver(
    @param:Value("\${playsay.media-service.ytdlp-path:yt-dlp}")
    private val ytdlpPath: String,
    private val ytDlpArguments: YoutubeYtDlpArguments = YoutubeYtDlpArguments(),
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    fun resolve(videoId: String): YoutubeResolvedVideo? {
        val startedAt = System.nanoTime()
        val process = runCatching {
            val command = buildList {
                add(ytdlpPath)
                addAll(ytDlpArguments.forVideo(videoId))
                addAll(
                    listOf(
                        "--no-playlist",
                        "--skip-download",
                        "--no-warnings",
                        "--dump-single-json",
                        "https://www.youtube.com/watch?v=$videoId",
                    ),
                )
            }
            ProcessBuilder(command)
                .start()
        }.getOrElse {
            logger.warn("media-service yt-dlp start failed videoId={} ytdlpPath={}", videoId, ytdlpPath, it)
            return null
        }
        val stdoutFuture = readTextAsync(process.inputStream)
        val stderrFuture = readTextAsync(process.errorStream)

        val finished = process.waitFor(25, TimeUnit.SECONDS)
        val durationMs = Duration.ofNanos(System.nanoTime() - startedAt).toMillis()
        if (!finished) {
            process.destroyForcibly()
            logger.warn("media-service yt-dlp timed out videoId={} durationMs={}", videoId, durationMs)
            return null
        }

        val stdout = readCompletedText(stdoutFuture, "stdout", videoId) ?: return null
        val stderr = readCompletedText(stderrFuture, "stderr", videoId) ?: return null
        if (process.exitValue() != 0) {
            logger.warn(
                "media-service yt-dlp failed videoId={} potEnabled={} failureKind={} exitCode={} durationMs={} stdoutLines={} stderrLines={}",
                videoId,
                ytDlpArguments.isEnabledFor(videoId),
                YoutubeYtDlpFailureClassifier.classify(stderr),
                process.exitValue(),
                durationMs,
                stdout.lineSequence().count(),
                stderr.lineSequence().count(),
            )
            return null
        }

        val root = runCatching { objectMapper.readTree(stdout) }.getOrElse {
            logger.warn("media-service yt-dlp json parse failed videoId={} durationMs={} stdoutChars={}", videoId, durationMs, stdout.length, it)
            return null
        }
        val resolvedId = root.path("id").asText(null)?.trim()
        if (resolvedId != videoId) {
            logger.warn("media-service yt-dlp id mismatch requestedVideoId={} resolvedVideoId={} durationMs={}", videoId, resolvedId, durationMs)
            return null
        }

        val formats = root.path("formats")
            .takeIf { node -> node.isArray }
            ?.mapNotNull(::formatFromNode)
            .orEmpty()

        logger.info(
            "media-service yt-dlp resolved metadata videoId={} potEnabled={} durationSeconds={} language={} thumbnailPresent={} formats={} durationMs={}",
            videoId,
            ytDlpArguments.isEnabledFor(videoId),
            root.path("duration").takeIf { node -> node.isNumber }?.asInt(),
            nullableText(root.path("language")),
            nullableText(root.path("thumbnail")) != null,
            formats.size,
            durationMs,
        )
        return YoutubeResolvedVideo(
            videoId = videoId,
            durationSeconds = root.path("duration").takeIf { node -> node.isNumber }?.asInt(),
            language = nullableText(root.path("language")),
            thumbnailUrl = nullableText(root.path("thumbnail")),
            formats = formats,
        )
    }

    private fun formatFromNode(node: JsonNode): YoutubeFormat? {
        val url = nullableText(node.path("url")) ?: return null
        val formatId = nullableText(node.path("format_id")) ?: nullableText(node.path("formatId")) ?: return null
        return YoutubeFormat(
            formatId = formatId,
            url = url,
            protocol = nullableText(node.path("protocol")),
            acodec = nullableText(node.path("acodec")),
            vcodec = nullableText(node.path("vcodec")),
            height = node.path("height").takeIf { value -> value.isNumber }?.asInt(),
            ext = nullableText(node.path("ext")),
        )
    }

    private fun nullableText(node: JsonNode): String? =
        node.takeIf { value -> value.isTextual }
            ?.asText()
            ?.trim()
            ?.takeIf { value -> value.isNotBlank() && value != "NA" && value != "None" && value != "null" }

    private fun readTextAsync(stream: InputStream): CompletableFuture<String> =
        CompletableFuture.supplyAsync {
            stream.bufferedReader().use { reader -> reader.readText() }
        }

    private fun readCompletedText(future: CompletableFuture<String>, streamName: String, videoId: String): String? =
        runCatching { future.get(5, TimeUnit.SECONDS) }
            .getOrElse {
                logger.warn("media-service yt-dlp stream read failed videoId={} stream={}", videoId, streamName, it)
                null
            }

    companion object {
        private val logger = LoggerFactory.getLogger(YoutubeMetadataResolver::class.java)
    }
}
