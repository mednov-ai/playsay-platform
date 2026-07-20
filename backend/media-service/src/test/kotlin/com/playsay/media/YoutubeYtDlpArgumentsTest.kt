package com.playsay.media

import com.playsay.media.service.YoutubeYtDlpArguments
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class YoutubeYtDlpArgumentsTest {
    @Test
    fun `does not add provider arguments when disabled`() {
        val arguments = YoutubeYtDlpArguments(
            enabled = false,
            allowedVideoIds = "video-1",
        )

        assertEquals(emptyList(), arguments.forVideo("video-1"))
        assertFalse(arguments.isEnabledFor("video-1"))
    }

    @Test
    fun `adds provider arguments only for allowlisted videos`() {
        val arguments = YoutubeYtDlpArguments(
            enabled = true,
            providerBaseUrl = "http://127.0.0.1:4416/",
            allowedVideoIds = "video-1, video-2",
            playerClients = "mweb, default",
        )

        assertTrue(arguments.isEnabledFor("video-2"))
        assertEquals(emptyList(), arguments.forVideo("video-3"))
        assertEquals(
            listOf(
                "--plugin-dirs",
                "/usr/local/lib/yt-dlp-plugins",
                "--js-runtimes",
                "deno:/usr/local/bin/deno",
                "--sleep-requests",
                "1",
                "--extractor-args",
                "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416",
                "--extractor-args",
                "youtube:player_client=mweb,default",
            ),
            arguments.forVideo("video-2"),
        )
    }

    @Test
    fun `wildcard enables provider for every valid caller video id`() {
        val arguments = YoutubeYtDlpArguments(
            enabled = true,
            allowedVideoIds = "*",
        )

        assertTrue(arguments.isEnabledFor("any-video"))
    }
}
