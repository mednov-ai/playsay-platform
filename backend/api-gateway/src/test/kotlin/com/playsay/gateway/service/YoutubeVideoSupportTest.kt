package com.playsay.gateway.service

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class YoutubeVideoSupportTest {
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
}
