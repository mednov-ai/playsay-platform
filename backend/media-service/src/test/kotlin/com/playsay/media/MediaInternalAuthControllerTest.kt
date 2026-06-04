package com.playsay.media

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.HttpStatus

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "playsay.media-service.service-token=test-media-token-0123456789",
    ],
)
class MediaInternalAuthControllerTest @Autowired constructor(
    @param:LocalServerPort private val port: Int,
) {
    @Test
    fun `internal metadata endpoint requires service token`() {
        val response = HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/internal/youtube/metadata"))
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""{"videoId":"5l-fo-d0gt8"}"""))
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        )

        assertEquals(HttpStatus.UNAUTHORIZED.value(), response.statusCode())
    }

    @Test
    fun `public stream endpoint does not require bearer token but rejects unknown sessions`() {
        val response = HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:$port/video-playback-sessions/${UUID.randomUUID()}/stream"))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        )

        assertEquals(HttpStatus.NOT_FOUND.value(), response.statusCode())
    }
}
