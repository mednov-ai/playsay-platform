package com.playsay.media

import com.playsay.media.service.YoutubeYtDlpFailureClassifier
import kotlin.test.Test
import kotlin.test.assertEquals

class YoutubeYtDlpFailureClassifierTest {
    @Test
    fun `classifies safe operational failure kinds without exposing stderr`() {
        assertEquals(
            "EMBED_DISABLED",
            YoutubeYtDlpFailureClassifier.classify("Playback on other websites has been disabled by the video owner"),
        )
        assertEquals("BOT_CHECK", YoutubeYtDlpFailureClassifier.classify("Sign in to confirm you’re not a bot"))
        assertEquals("RATE_LIMITED", YoutubeYtDlpFailureClassifier.classify("HTTP Error 429: Too Many Requests"))
        assertEquals("FORMAT_UNAVAILABLE", YoutubeYtDlpFailureClassifier.classify("Requested format is not available"))
        assertEquals("VIDEO_UNAVAILABLE", YoutubeYtDlpFailureClassifier.classify("This video is not available"))
        assertEquals("UNKNOWN", YoutubeYtDlpFailureClassifier.classify("unexpected extractor failure"))
    }
}
