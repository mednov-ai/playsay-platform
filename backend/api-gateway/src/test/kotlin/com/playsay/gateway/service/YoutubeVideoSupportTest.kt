package com.playsay.gateway.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class YoutubeVideoSupportTest {
    private val objectMapper = jacksonObjectMapper()

    @Test
    fun `parses common youtube video urls`() {
        assertEquals("5l-fo-d0gt8", YoutubeVideoSupport.parseVideoId("https://www.youtube.com/watch?v=5l-fo-d0gt8&si=abc"))
        assertEquals("5l-fo-d0gt8", YoutubeVideoSupport.parseVideoId("https://youtu.be/5l-fo-d0gt8?t=45"))
        assertEquals("5l-fo-d0gt8", YoutubeVideoSupport.parseVideoId("https://www.youtube.com/embed/5l-fo-d0gt8"))
        assertEquals("5l-fo-d0gt8", YoutubeVideoSupport.parseVideoId("https://www.youtube.com/shorts/5l-fo-d0gt8"))
        assertNull(YoutubeVideoSupport.parseVideoId("https://example.com/watch?v=5l-fo-d0gt8"))
    }

    @Test
    fun `builds privacy enhanced embed url with start seconds`() {
        assertEquals(
            "https://www.youtube-nocookie.com/embed/5l-fo-d0gt8?rel=0&start=75",
            YoutubeVideoSupport.embedUrl("5l-fo-d0gt8", 75),
        )
    }

    @Test
    fun `accepts only english videos up to seven minutes`() {
        assertTrue(
            YoutubeVideoSupport.videoMeetsPolicy(
                YoutubeVideoMeta(videoId = "5l-fo-d0gt8", durationSeconds = 420, language = "en-US"),
            ).approved,
        )
        assertFalse(
            YoutubeVideoSupport.videoMeetsPolicy(
                YoutubeVideoMeta(videoId = "5l-fo-d0gt8", durationSeconds = 421, language = "en"),
            ).approved,
        )
        assertFalse(
            YoutubeVideoSupport.videoMeetsPolicy(
                YoutubeVideoMeta(videoId = "5l-fo-d0gt8", durationSeconds = 120, language = "ru"),
            ).approved,
        )
    }

    @Test
    fun `diagnostics report short youtube url and missing metadata without storing raw query`() {
        val block = objectMapper.readTree(
            """
            {
              "id": "video-1",
              "type": "videoEmbed",
              "provider": "YOUTUBE",
              "url": "https://youtu.be/N2Au0UdymCU?si=Mh-H1WNVHWYk8tR-"
            }
            """.trimIndent(),
        )

        val diagnostics = YoutubeVideoSupport.diagnosticsFromBlock(block)

        assertEquals("videoEmbed", diagnostics.blockType)
        assertEquals("YOUTUBE", diagnostics.provider)
        assertEquals("youtu.be", diagnostics.urlHost)
        assertEquals("SHORT", diagnostics.urlKind)
        assertEquals("N2Au0UdymCU", diagnostics.videoId)
        assertFalse(diagnostics.videoMetaPresent)
        assertFalse(diagnostics.durationPresent)
        assertNull(diagnostics.durationSeconds)
        assertEquals("MISSING", diagnostics.durationNodeType)
        assertFalse(diagnostics.languagePresent)
        assertNull(diagnostics.language)
    }

    @Test
    fun `diagnostics report malformed metadata field types`() {
        val block = objectMapper.readTree(
            """
            {
              "type": "videoEmbed",
              "provider": "YOUTUBE",
              "url": "youtube.com/watch?v=5l-fo-d0gt8",
              "videoMeta": {
                "durationSeconds": "300",
                "language": ""
              }
            }
            """.trimIndent(),
        )

        val diagnostics = YoutubeVideoSupport.diagnosticsFromBlock(block)

        assertEquals("WATCH", diagnostics.urlKind)
        assertEquals("5l-fo-d0gt8", diagnostics.videoId)
        assertTrue(diagnostics.videoMetaPresent)
        assertFalse(diagnostics.durationPresent)
        assertEquals("STRING", diagnostics.durationNodeType)
        assertFalse(diagnostics.languagePresent)
    }
}
