package com.playsay.media

import com.playsay.media.service.MediaServiceException
import com.playsay.media.service.InMemoryMediaObjectStorage
import com.playsay.media.service.YoutubePlaybackQuality
import com.playsay.media.service.YoutubePlaybackSessionStore
import com.playsay.media.service.YoutubeMetadataResolver
import com.playsay.media.service.YoutubeRelayStreamService
import com.playsay.media.service.YoutubeVideoCacheService
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import com.sun.net.httpserver.HttpServer
import java.io.ByteArrayOutputStream
import java.net.InetSocketAddress
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import org.springframework.http.HttpStatus

class YoutubeRelayStreamServiceTest {
    @Test
    fun `streams bounded range from stored playback session without exposing upstream url`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        var receivedRange: String? = null
        server.createContext("/video") { exchange ->
            receivedRange = exchange.requestHeaders.getFirst("Range")
            val body = "video-bytes".encodeToByteArray()
            exchange.responseHeaders.add("Content-Type", "video/mp4")
            exchange.responseHeaders.add("Accept-Ranges", "bytes")
            exchange.responseHeaders.add("Content-Range", "bytes 0-3/100")
            exchange.sendResponseHeaders(206, body.size.toLong())
            exchange.responseBody.use { output -> output.write(body) }
        }
        server.start()

        try {
            val upstreamUrl = "http://127.0.0.1:${server.address.port}/video"
            val sessionStore = YoutubePlaybackSessionStore(
                clock = Clock.fixed(Instant.parse("2026-06-04T08:00:00Z"), ZoneOffset.UTC),
            )
            val session = sessionStore.create(
                subject = "teacher-1",
                materialId = UUID.randomUUID(),
                blockId = "video-1",
                videoId = "5l-fo-d0gt8",
                upstreamUrl = upstreamUrl,
                requestedQuality = YoutubePlaybackQuality.MEDIUM,
                selectedQuality = YoutubePlaybackQuality.MEDIUM,
                selectedHeight = 720,
                ttlSeconds = 900,
            )
            val service = streamService(sessionStore, maxUpstreamRangeBytes = 4)

            val response = service.stream(session.id, "bytes=0-")
            val body = ByteArrayOutputStream()
            assertNotNull(response.body).writeTo(body)

            assertEquals(HttpStatus.PARTIAL_CONTENT, response.statusCode)
            assertEquals("bytes=0-3", receivedRange)
            assertEquals("bytes 0-3/100", response.headers.getFirst("Content-Range"))
            assertEquals("no", response.headers.getFirst("X-Accel-Buffering"))
            assertEquals("video-bytes", body.toString(Charsets.UTF_8))
            assertEquals(false, response.headers.toString().contains(upstreamUrl))
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun `unknown stream session returns not found`() {
        val sessionStore = YoutubePlaybackSessionStore(
            clock = Clock.fixed(Instant.parse("2026-06-04T08:00:00Z"), ZoneOffset.UTC),
        )
        val service = streamService(sessionStore)

        val error = kotlin.test.assertFailsWith<MediaServiceException> {
            service.stream(UUID.randomUUID(), null)
        }

        assertEquals(HttpStatus.NOT_FOUND, error.status)
    }

    @Test
    fun `streams bounded range from minio cache session`() {
        val objectStorage = InMemoryMediaObjectStorage()
        val storageKey = YoutubeVideoCacheService.storageKey("5l-fo-d0gt8", YoutubePlaybackQuality.MEDIUM)
        objectStorage.putObject(storageKey, "video-bytes".encodeToByteArray(), "video/mp4")
        val sessionStore = YoutubePlaybackSessionStore(
            clock = Clock.fixed(Instant.parse("2026-06-04T08:00:00Z"), ZoneOffset.UTC),
        )
        val session = sessionStore.create(
            subject = "teacher-1",
            materialId = UUID.randomUUID(),
            blockId = "video-1",
            videoId = "5l-fo-d0gt8",
            upstreamUrl = null,
            requestedQuality = YoutubePlaybackQuality.MEDIUM,
            selectedQuality = YoutubePlaybackQuality.MEDIUM,
            selectedHeight = 720,
            ttlSeconds = 900,
            cacheStorageKey = storageKey,
            deliverySource = "MINIO_CACHE",
        )
        val service = streamService(sessionStore, objectStorage, maxUpstreamRangeBytes = 4)

        val response = service.stream(session.id, "bytes=2-")
        val body = ByteArrayOutputStream()
        assertNotNull(response.body).writeTo(body)

        assertEquals(HttpStatus.PARTIAL_CONTENT, response.statusCode)
        assertEquals("bytes 2-5/11", response.headers.getFirst("Content-Range"))
        assertEquals("deo-", body.toString(Charsets.UTF_8))
    }

    private fun streamService(
        sessionStore: YoutubePlaybackSessionStore,
        objectStorage: InMemoryMediaObjectStorage = InMemoryMediaObjectStorage(),
        maxUpstreamRangeBytes: Long = 1_048_576,
    ): YoutubeRelayStreamService =
        YoutubeRelayStreamService(
            sessionStore = sessionStore,
            objectStorage = objectStorage,
            metadataResolver = YoutubeMetadataResolver("/path/that/does/not/exist"),
            meterRegistry = SimpleMeterRegistry(),
            maxUpstreamRangeBytes = maxUpstreamRangeBytes,
        )
}
