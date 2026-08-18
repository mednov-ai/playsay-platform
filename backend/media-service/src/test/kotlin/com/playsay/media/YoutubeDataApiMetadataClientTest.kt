package com.playsay.media

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.media.service.YoutubeDataApiMetadataClient
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.http.HttpClient
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class YoutubeDataApiMetadataClientTest {
    @Test
    fun `resolves duration audio language and largest thumbnail`() = withServer(
        status = 200,
        body = """
            {
              "items": [{
                "id": "_TGPrAdUaTY",
                "contentDetails": {"duration": "PT3M42S"},
                "snippet": {
                  "defaultAudioLanguage": "en-US",
                  "thumbnails": {
                    "default": {"url": "https://img.example/default.jpg", "width": 120},
                    "high": {"url": "https://img.example/high.jpg", "width": 480}
                  }
                }
              }]
            }
        """.trimIndent(),
    ) { baseUrl, requestTarget ->
        val metadata = client(baseUrl).resolve("_TGPrAdUaTY")

        assertEquals(222, metadata?.durationSeconds)
        assertEquals("en-US", metadata?.language)
        assertEquals("https://img.example/high.jpg", metadata?.thumbnailUrl)
        assertTrue(requestTarget().contains("part=contentDetails%2Csnippet"))
        assertTrue(requestTarget().contains("id=_TGPrAdUaTY"))
    }

    @Test
    fun `keeps language missing instead of using text language`() = withServer(
        status = 200,
        body = """
            {"items":[{"id":"_TGPrAdUaTY","contentDetails":{"duration":"PT3M42S"},"snippet":{"defaultLanguage":"en"}}]}
        """.trimIndent(),
    ) { baseUrl, _ ->
        val metadata = client(baseUrl).resolve("_TGPrAdUaTY")

        assertEquals(222, metadata?.durationSeconds)
        assertNull(metadata?.language)
    }

    @Test
    fun `returns null for unavailable or malformed responses`() {
        withServer(429, "{}") { baseUrl, _ -> assertNull(client(baseUrl).resolve("_TGPrAdUaTY")) }
        withServer(200, "not-json") { baseUrl, _ -> assertNull(client(baseUrl).resolve("_TGPrAdUaTY")) }
    }

    @Test
    fun `does not call data api when key is missing`() {
        val metadata = YoutubeDataApiMetadataClient(apiKey = "").resolve("_TGPrAdUaTY")
        assertNull(metadata)
    }

    private fun client(baseUrl: String) = YoutubeDataApiMetadataClient(
        apiKey = "test-api-key",
        baseUrl = baseUrl,
        timeoutSeconds = 2,
        objectMapper = jacksonObjectMapper(),
        httpClient = HttpClient.newHttpClient(),
    )

    private fun withServer(status: Int, body: String, assertion: (String, () -> String) -> Unit) {
        var target = ""
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/youtube/v3/videos") { exchange ->
            target = exchange.requestURI.toString()
            val bytes = body.toByteArray()
            exchange.sendResponseHeaders(status, bytes.size.toLong())
            exchange.responseBody.use { output -> output.write(bytes) }
        }
        server.start()
        try {
            assertion("http://127.0.0.1:${server.address.port}/youtube/v3", { target })
        } finally {
            server.stop(0)
        }
    }
}
