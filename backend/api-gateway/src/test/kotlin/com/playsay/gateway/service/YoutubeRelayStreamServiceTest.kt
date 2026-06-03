package com.playsay.gateway.service

import com.sun.net.httpserver.HttpServer
import java.io.ByteArrayOutputStream
import java.net.InetSocketAddress
import java.nio.file.Files
import java.time.Instant
import java.util.UUID
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import org.springframework.http.HttpStatus

class YoutubeRelayStreamServiceTest {
    @Test
    fun `streams bytes from resolved media url without exposing upstream url`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        var receivedRange: String? = null
        server.createContext("/video") { exchange ->
            receivedRange = exchange.requestHeaders.getFirst("Range")
            val body = "video-bytes".encodeToByteArray()
            exchange.responseHeaders.add("Content-Type", "video/mp4")
            exchange.responseHeaders.add("Accept-Ranges", "bytes")
            exchange.sendResponseHeaders(206, body.size.toLong())
            exchange.responseBody.use { output -> output.write(body) }
        }
        server.start()

        try {
            val upstreamUrl = "http://127.0.0.1:${server.address.port}/video"
            val ytdlp = Files.createTempFile("playsay-ytdlp", ".sh")
            ytdlp.writeText("#!/usr/bin/env sh\nprintf '%s\\n' '$upstreamUrl'\n")
            ytdlp.toFile().setExecutable(true)
            val service = YoutubeRelayStreamService(ytdlpPath = ytdlp.toString())

            val response = service.stream(
                session = YoutubePlaybackSession(
                    id = UUID.randomUUID(),
                    subject = "teacher-1",
                    materialId = UUID.randomUUID(),
                    blockId = "video-1",
                    videoId = "5l-fo-d0gt8",
                    expiresAt = Instant.now().plusSeconds(900),
                ),
                rangeHeader = "bytes=0-4",
            )
            val body = ByteArrayOutputStream()
            assertNotNull(response.body).writeTo(body)

            assertEquals(HttpStatus.PARTIAL_CONTENT, response.statusCode)
            assertEquals("bytes=0-4", receivedRange)
            assertEquals("video-bytes", body.toString(Charsets.UTF_8))
            assertFalse(response.headers.toString().contains(upstreamUrl))
        } finally {
            server.stop(0)
        }
    }
}
