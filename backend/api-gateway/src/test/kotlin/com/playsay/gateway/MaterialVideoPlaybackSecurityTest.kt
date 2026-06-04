package com.playsay.gateway

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.HttpStatus

@SpringBootTest(
    webEnvironment = WebEnvironment.RANDOM_PORT,
    properties = [
        "spring.datasource.url=jdbc:h2:mem:material-video-playback-security;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
class MaterialVideoPlaybackSecurityTest @Autowired constructor(
    @param:LocalServerPort private val port: Int,
) {
    @Test
    fun `old gateway stream endpoint is no longer a public video route`() {
        val response = HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(
                URI.create("http://127.0.0.1:$port/materials/video-playback-sessions/${UUID.randomUUID()}/stream"),
            ).GET().build(),
            HttpResponse.BodyHandlers.discarding(),
        )

        assertEquals(HttpStatus.UNAUTHORIZED.value(), response.statusCode())
    }
}
