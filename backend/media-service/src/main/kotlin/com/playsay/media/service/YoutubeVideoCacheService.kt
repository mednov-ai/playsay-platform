package com.playsay.media.service

import com.playsay.contract.media.model.YoutubePlaybackQuality as ContractYoutubePlaybackQuality
import com.playsay.contract.media.model.YoutubeVideoCacheRequest
import com.playsay.contract.media.model.YoutubeVideoCacheResponse
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.Comparator
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

data class CachedYoutubeVideo(
    val videoId: String,
    val storageKey: String,
    val requestedQuality: YoutubePlaybackQuality,
    val selectedQuality: YoutubePlaybackQuality,
    val selectedHeight: Int?,
    val contentType: String,
    val byteSize: Long,
    val durationSeconds: Int?,
    val language: String?,
    val thumbnailUrl: String?,
)

@Component
class YoutubeVideoCacheService(
    private val metadataResolver: YoutubeMetadataResolver,
    private val objectStorage: MediaObjectStorage,
    private val meterRegistry: MeterRegistry,
    @param:Value("\${playsay.media-service.youtube-cache-enabled:false}")
    private val enabled: Boolean,
    @param:Value("\${playsay.media-service.cache-download-timeout-seconds:600}")
    private val downloadTimeoutSeconds: Long,
    @param:Value("\${playsay.media-service.cache-max-video-bytes:262144000}")
    private val maxVideoBytes: Long,
    @param:Value("\${playsay.media-service.cache-temp-directory:/tmp/playsay-media-cache}")
    private val cacheTempDirectory: String,
    @param:Value("\${playsay.media-service.ffmpeg-path:/usr/local/bin/ffmpeg}")
    private val ffmpegPath: String,
    @param:Value("\${playsay.media-service.ytdlp-path:yt-dlp}")
    private val ytdlpPath: String,
    private val ytDlpArguments: YoutubeYtDlpArguments = YoutubeYtDlpArguments(),
) {
    private val locks = ConcurrentHashMap<String, Any>()

    fun cache(request: YoutubeVideoCacheRequest): YoutubeVideoCacheResponse {
        requireEnabled()
        val videoId = validatedVideoId(request.videoId)
        val requestedQuality = YoutubePlaybackQuality.normalized(request.requestedQuality?.value)
        if (requestedQuality != YoutubePlaybackQuality.MEDIUM) {
            throw MediaServiceException(HttpStatus.BAD_REQUEST, "YOUTUBE_CACHE_MEDIUM_ONLY")
        }
        val storageKey = storageKey(videoId, requestedQuality)
        val lock = locks.computeIfAbsent(storageKey) { Any() }
        return try {
            synchronized(lock) {
                find(videoId, requestedQuality)?.toResponse("READY") ?: downloadAndStore(videoId, requestedQuality, storageKey).toResponse("READY")
            }
        } finally {
            locks.remove(storageKey, lock)
        }
    }

    fun find(videoId: String, quality: YoutubePlaybackQuality = YoutubePlaybackQuality.MEDIUM): CachedYoutubeVideo? {
        if (!enabled || quality != YoutubePlaybackQuality.MEDIUM || !videoIdPattern.matches(videoId)) {
            return null
        }
        val key = storageKey(videoId, quality)
        val head = runCatching { objectStorage.headObject(key) }
            .onFailure { logger.warn("media-service cache head failed videoId={} quality={}", videoId, quality, it) }
            .getOrNull()
            ?: run {
                meterRegistry.counter("playsay.youtube.cache.lookups", "result", "miss").increment()
                return null
            }
        val selectedQuality = runCatching { YoutubePlaybackQuality.valueOf(head.metadata[META_SELECTED_QUALITY].orEmpty()) }.getOrNull()
            ?: return invalidCache(videoId, quality, key, "selected-quality")
        val storedVideoId = head.metadata[META_VIDEO_ID]
        val storedRequestedQuality = head.metadata[META_REQUESTED_QUALITY]
        if (
            storedVideoId != videoId ||
            storedRequestedQuality != quality.name ||
            head.contentLength <= 0 ||
            head.contentType.lowercase() != VIDEO_CONTENT_TYPE
        ) {
            return invalidCache(videoId, quality, key, "metadata")
        }
        meterRegistry.counter("playsay.youtube.cache.lookups", "result", "hit").increment()
        return CachedYoutubeVideo(
            videoId = videoId,
            storageKey = key,
            requestedQuality = quality,
            selectedQuality = selectedQuality,
            selectedHeight = head.metadata[META_SELECTED_HEIGHT]?.toIntOrNull(),
            contentType = head.contentType,
            byteSize = head.contentLength,
            durationSeconds = head.metadata[META_DURATION_SECONDS]?.toIntOrNull(),
            language = head.metadata[META_LANGUAGE],
            thumbnailUrl = head.metadata[META_THUMBNAIL_URL],
        )
    }

    fun delete(videoId: String, quality: String): Boolean {
        requireEnabled()
        val validVideoId = validatedVideoId(videoId)
        val requestedQuality = YoutubePlaybackQuality.normalized(quality)
        if (requestedQuality != YoutubePlaybackQuality.MEDIUM) {
            throw MediaServiceException(HttpStatus.BAD_REQUEST, "YOUTUBE_CACHE_MEDIUM_ONLY")
        }
        return objectStorage.deleteObject(storageKey(validVideoId, requestedQuality))
    }

    private fun downloadAndStore(
        videoId: String,
        requestedQuality: YoutubePlaybackQuality,
        storageKey: String,
    ): CachedYoutubeVideo {
        val sample = Timer.start(meterRegistry)
        val metadata = metadataResolver.resolve(videoId)
            ?: throw cacheFailure(videoId, "metadata", "YOUTUBE_CACHE_UNAVAILABLE")
        val selectedHeight = metadata.formats.asSequence()
            .filter { format -> format.vcodec?.lowercase() != "none" }
            .filter { format -> format.ext?.lowercase() == "mp4" }
            .mapNotNull { format -> format.height }
            .filter { height -> height <= requestedQuality.targetHeight }
            .maxOrNull()
        val selectedQuality = YoutubePlaybackQuality.fromHeight(selectedHeight)
        val baseDirectory = Path.of(cacheTempDirectory)
        Files.createDirectories(baseDirectory)
        val tempDirectory = Files.createTempDirectory(baseDirectory, "youtube-$videoId-")
        try {
            val outputTemplate = tempDirectory.resolve("video.%(ext)s").toString()
            val process = startDownload(videoId, outputTemplate)
            val stdoutFuture = readTextAsync(process.inputStream)
            val stderrFuture = readTextAsync(process.errorStream)
            val finished = process.waitFor(downloadTimeoutSeconds.coerceIn(30, 900), TimeUnit.SECONDS)
            if (!finished) {
                destroyProcessTree(process)
                throw cacheFailure(videoId, "timeout", "YOUTUBE_CACHE_TIMEOUT")
            }
            readCompletedText(stdoutFuture)
            val stderr = readCompletedText(stderrFuture)
            if (process.exitValue() != 0) {
                logger.warn(
                    "media-service cache download failed videoId={} state=download-failed potEnabled={} failureKind={}",
                    videoId,
                    ytDlpArguments.isEnabledFor(videoId),
                    YoutubeYtDlpFailureClassifier.classify(stderr),
                )
                throw cacheFailure(videoId, "download", "YOUTUBE_CACHE_UNAVAILABLE")
            }
            val file = Files.list(tempDirectory).use { paths ->
                paths.filter { path -> Files.isRegularFile(path) && path.fileName.toString().endsWith(".mp4") }
                    .findFirst()
                    .orElse(null)
            } ?: throw cacheFailure(videoId, "output", "YOUTUBE_CACHE_UNAVAILABLE")
            val byteSize = Files.size(file)
            if (byteSize <= 0 || byteSize > maxVideoBytes.coerceAtLeast(1)) {
                logger.warn("media-service cache operation rejected videoId={} stage=size byteSize={}", videoId, byteSize)
                throw MediaServiceException(HttpStatus.PAYLOAD_TOO_LARGE, "YOUTUBE_CACHE_SIZE_REJECTED")
            }
            val storedMetadata = buildMap {
                put(META_VIDEO_ID, videoId)
                put(META_REQUESTED_QUALITY, requestedQuality.name)
                put(META_SELECTED_QUALITY, selectedQuality.name)
                selectedHeight?.let { value -> put(META_SELECTED_HEIGHT, value.toString()) }
                metadata.durationSeconds?.let { value -> put(META_DURATION_SECONDS, value.toString()) }
                metadata.language?.let { value -> put(META_LANGUAGE, value) }
                metadata.thumbnailUrl?.let { value -> put(META_THUMBNAIL_URL, value) }
            }
            objectStorage.putFile(storageKey, file, VIDEO_CONTENT_TYPE, storedMetadata)
            meterRegistry.counter("playsay.youtube.cache.downloads", "result", "ready").increment()
            sample.stop(meterRegistry.timer("playsay.youtube.cache.download.duration", "result", "ready"))
            return CachedYoutubeVideo(
                videoId = videoId,
                storageKey = storageKey,
                requestedQuality = requestedQuality,
                selectedQuality = selectedQuality,
                selectedHeight = selectedHeight,
                contentType = VIDEO_CONTENT_TYPE,
                byteSize = byteSize,
                durationSeconds = metadata.durationSeconds,
                language = metadata.language,
                thumbnailUrl = metadata.thumbnailUrl,
            )
        } catch (exception: MediaServiceException) {
            meterRegistry.counter("playsay.youtube.cache.downloads", "result", "failed").increment()
            sample.stop(meterRegistry.timer("playsay.youtube.cache.download.duration", "result", "failed"))
            throw exception
        } catch (exception: Exception) {
            meterRegistry.counter("playsay.youtube.cache.downloads", "result", "failed").increment()
            sample.stop(meterRegistry.timer("playsay.youtube.cache.download.duration", "result", "failed"))
            logger.warn("media-service cache storage failed videoId={}", videoId, exception)
            throw MediaServiceException(HttpStatus.SERVICE_UNAVAILABLE, "YOUTUBE_CACHE_UNAVAILABLE")
        } finally {
            deleteRecursively(tempDirectory)
        }
    }

    private fun startDownload(videoId: String, outputTemplate: String): Process =
        runCatching {
            val command = buildList {
                add(ytdlpPath)
                addAll(ytDlpArguments.forVideo(videoId))
                addAll(
                    listOf(
                        "--no-playlist",
                        "--no-warnings",
                        "--no-progress",
                        "--max-filesize",
                        maxVideoBytes.coerceAtLeast(1).toString(),
                        "--ffmpeg-location",
                        ffmpegPath,
                        "--format",
                        CACHE_FORMAT_SELECTOR,
                        "--merge-output-format",
                        "mp4",
                        "--output",
                        outputTemplate,
                        "https://www.youtube.com/watch?v=$videoId",
                    ),
                )
            }
            ProcessBuilder(command).start()
        }.getOrElse {
            logger.warn("media-service cache download failed videoId={} state=start-failed", videoId, it)
            throw MediaServiceException(HttpStatus.SERVICE_UNAVAILABLE, "YOUTUBE_CACHE_UNAVAILABLE")
        }

    private fun invalidCache(videoId: String, quality: YoutubePlaybackQuality, storageKey: String, reason: String): CachedYoutubeVideo? {
        logger.warn("media-service cache object invalid videoId={} quality={} reason={}", videoId, quality, reason)
        runCatching { objectStorage.deleteObject(storageKey) }
        meterRegistry.counter("playsay.youtube.cache.lookups", "result", "invalid").increment()
        return null
    }

    private fun validatedVideoId(value: String): String =
        value.trim().takeIf(videoIdPattern::matches)
            ?: throw MediaServiceException(HttpStatus.BAD_REQUEST, "YOUTUBE_VIDEO_ID_INVALID")

    private fun requireEnabled() {
        if (!enabled) {
            throw MediaServiceException(HttpStatus.SERVICE_UNAVAILABLE, "YOUTUBE_CACHE_DISABLED")
        }
    }

    private fun cacheFailure(videoId: String, stage: String, code: String): MediaServiceException {
        logger.warn("media-service cache operation failed videoId={} stage={} code={}", videoId, stage, code)
        return MediaServiceException(HttpStatus.SERVICE_UNAVAILABLE, code)
    }

    private fun readTextAsync(stream: InputStream): CompletableFuture<String> =
        CompletableFuture.supplyAsync { stream.bufferedReader().use { reader -> reader.readText() } }

    private fun readCompletedText(future: CompletableFuture<String>): String =
        runCatching { future.get(5, TimeUnit.SECONDS) }.getOrDefault("")

    private fun destroyProcessTree(process: Process) {
        process.toHandle().descendants().forEach { child -> child.destroyForcibly() }
        process.destroyForcibly()
        runCatching { process.waitFor(5, TimeUnit.SECONDS) }
    }

    private fun deleteRecursively(directory: Path) {
        runCatching {
            Files.walk(directory).use { paths ->
                paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
            }
        }.onFailure { logger.warn("media-service cache temp cleanup failed state=cleanup-failed", it) }
    }

    private fun CachedYoutubeVideo.toResponse(status: String): YoutubeVideoCacheResponse =
        YoutubeVideoCacheResponse(
            videoId = videoId,
            status = YoutubeVideoCacheResponse.Status.valueOf(status),
            storageKey = storageKey,
            requestedQuality = ContractYoutubePlaybackQuality.valueOf(requestedQuality.name),
            selectedQuality = ContractYoutubePlaybackQuality.valueOf(selectedQuality.name),
            selectedHeight = selectedHeight,
            contentType = contentType,
            byteSize = byteSize,
            durationSeconds = durationSeconds,
            language = language,
            thumbnailUrl = thumbnailUrl,
        )

    companion object {
        private const val VIDEO_CONTENT_TYPE = "video/mp4"
        private const val CACHE_FORMAT_SELECTOR =
            "bv*[height<=720][ext=mp4][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4][vcodec^=avc1]/b[height<=720][ext=mp4]"
        private const val META_VIDEO_ID = "video-id"
        private const val META_REQUESTED_QUALITY = "requested-quality"
        private const val META_SELECTED_QUALITY = "selected-quality"
        private const val META_SELECTED_HEIGHT = "selected-height"
        private const val META_DURATION_SECONDS = "duration-seconds"
        private const val META_LANGUAGE = "language"
        private const val META_THUMBNAIL_URL = "thumbnail-url"
        private val videoIdPattern = Regex("^[A-Za-z0-9_-]{6,32}$")
        private val logger = LoggerFactory.getLogger(YoutubeVideoCacheService::class.java)

        fun storageKey(videoId: String, quality: YoutubePlaybackQuality): String =
            "youtube-cache/v1/$videoId/${quality.name.lowercase()}.mp4"
    }
}
