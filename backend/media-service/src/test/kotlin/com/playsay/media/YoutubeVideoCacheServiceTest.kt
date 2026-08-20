package com.playsay.media

import com.playsay.contract.media.model.YoutubePlaybackQuality
import com.playsay.contract.media.model.YoutubeVideoCacheRequest
import com.playsay.contract.media.model.YoutubeVideoCacheResponse
import com.playsay.media.service.InMemoryMediaObjectStorage
import com.playsay.media.service.MediaServiceException
import com.playsay.media.service.YoutubeMetadataResolver
import com.playsay.media.service.YoutubeVideoCacheService
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import org.junit.jupiter.api.io.TempDir
import org.springframework.http.HttpStatus

class YoutubeVideoCacheServiceTest {
    @TempDir
    lateinit var tempDirectory: Path

    @Test
    fun `downloads medium mp4 once and reuses deterministic object`() {
        val invocationFile = tempDirectory.resolve("downloads")
        val ytdlp = fakeYtdlp(invocationFile)
        val storage = InMemoryMediaObjectStorage()
        val service = cacheService(ytdlp, storage, maxVideoBytes = 1024)
        val request = YoutubeVideoCacheRequest(videoId = "5l-fo-d0gt8", requestedQuality = YoutubePlaybackQuality.MEDIUM)

        val first = service.cache(request)
        val second = service.cache(request)

        assertEquals(YoutubeVideoCacheResponse.Status.READY, first.status)
        assertEquals("youtube-cache/v1/5l-fo-d0gt8/medium.mp4", first.storageKey)
        assertEquals(first, second)
        assertEquals("x", invocationFile.readText())
        val stored = assertNotNull(storage.headObject(first.storageKey))
        assertEquals("video/mp4", stored.contentType)
        assertEquals(11L, stored.contentLength)
        assertEquals("720", stored.metadata["selected-height"])
    }

    @Test
    fun `rejects file above configured limit without storing it`() {
        val ytdlp = fakeYtdlp(tempDirectory.resolve("large-downloads"))
        val storage = InMemoryMediaObjectStorage()
        val service = cacheService(ytdlp, storage, maxVideoBytes = 4)

        val error = assertFailsWith<MediaServiceException> {
            service.cache(YoutubeVideoCacheRequest(videoId = "5l-fo-d0gt8", requestedQuality = YoutubePlaybackQuality.MEDIUM))
        }

        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, error.status)
        assertEquals("YOUTUBE_CACHE_SIZE_REJECTED", error.code)
        assertEquals(null, storage.headObject("youtube-cache/v1/5l-fo-d0gt8/medium.mp4"))
    }

    private fun cacheService(
        ytdlp: Path,
        storage: InMemoryMediaObjectStorage,
        maxVideoBytes: Long,
    ): YoutubeVideoCacheService =
        YoutubeVideoCacheService(
            metadataResolver = YoutubeMetadataResolver(ytdlp.toString()),
            objectStorage = storage,
            meterRegistry = SimpleMeterRegistry(),
            enabled = true,
            downloadTimeoutSeconds = 30,
            maxVideoBytes = maxVideoBytes,
            cacheTempDirectory = tempDirectory.resolve("cache").toString(),
            ffmpegPath = "/usr/local/bin/ffmpeg",
            ytdlpPath = ytdlp.toString(),
        )

    private fun fakeYtdlp(invocationFile: Path): Path {
        val script = tempDirectory.resolve("fake-yt-dlp-${invocationFile.fileName}.sh")
        Files.writeString(
            script,
            """
            #!/bin/sh
            case " ${'$'}* " in
              *" --skip-download "*)
                printf '%s\n' '{"id":"5l-fo-d0gt8","duration":105,"language":"en","thumbnail":"https://img.example/thumbnail.jpg","formats":[{"format_id":"22","url":"https://media.example/video.mp4","protocol":"https","acodec":"mp4a.40.2","vcodec":"avc1.64001F","height":720,"ext":"mp4"}]}'
                ;;
              *)
                output=''
                while [ "${'$'}#" -gt 0 ]; do
                  if [ "${'$'}1" = '--output' ]; then
                    shift
                    output="${'$'}1"
                    break
                  fi
                  shift
                done
                printf 'video-bytes' > "${'$'}(dirname "${'$'}output")/video.mp4"
                printf 'x' >> "$invocationFile"
                ;;
            esac
            """.trimIndent(),
        )
        check(script.toFile().setExecutable(true))
        return script
    }
}
