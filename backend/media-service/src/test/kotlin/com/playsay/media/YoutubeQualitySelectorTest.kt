package com.playsay.media

import com.playsay.media.service.YoutubeFormat
import com.playsay.media.service.YoutubePlaybackQuality
import com.playsay.media.service.YoutubeQualitySelector
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class YoutubeQualitySelectorTest {
    @Test
    fun `selects best progressive format at or below requested height`() {
        val selected = YoutubeQualitySelector.select(
            formats = listOf(
                youtubeFormat(formatId = "18", height = 360),
                youtubeFormat(formatId = "22", height = 720),
                youtubeFormat(formatId = "37", height = 1080),
            ),
            requestedQuality = YoutubePlaybackQuality.MEDIUM,
        )

        assertEquals("22", selected?.formatId)
        assertEquals(720, selected?.height)
        assertEquals(YoutubePlaybackQuality.MEDIUM, selected?.selectedQuality)
    }

    @Test
    fun `falls back to best available progressive format when target is unavailable`() {
        val selected = YoutubeQualitySelector.select(
            formats = listOf(
                youtubeFormat(formatId = "18", height = 360),
                youtubeFormat(formatId = "37", height = 1080),
            ),
            requestedQuality = YoutubePlaybackQuality.MEDIUM,
        )

        assertEquals("18", selected?.formatId)
        assertEquals(360, selected?.height)
        assertEquals(YoutubePlaybackQuality.LOW, selected?.selectedQuality)
    }

    @Test
    fun `ignores adaptive or non http formats`() {
        val selected = YoutubeQualitySelector.select(
            formats = listOf(
                youtubeFormat(formatId = "audio", height = null, acodec = "opus", vcodec = "none"),
                youtubeFormat(formatId = "video", height = 1080, acodec = "none", vcodec = "av01"),
                youtubeFormat(formatId = "dash", height = 720, protocol = "m3u8_native"),
                youtubeFormat(formatId = "18", height = 360),
            ),
            requestedQuality = YoutubePlaybackQuality.HIGH,
        )

        assertEquals("18", selected?.formatId)
        assertEquals(360, selected?.height)
    }

    @Test
    fun `returns null when no progressive http format is available`() {
        val selected = YoutubeQualitySelector.select(
            formats = listOf(
                youtubeFormat(formatId = "audio", height = null, acodec = "opus", vcodec = "none"),
                youtubeFormat(formatId = "video", height = 1080, acodec = "none", vcodec = "av01"),
            ),
            requestedQuality = YoutubePlaybackQuality.HIGH,
        )

        assertNull(selected)
    }
}

private fun youtubeFormat(
    formatId: String,
    height: Int?,
    protocol: String = "https",
    acodec: String = "mp4a.40.2",
    vcodec: String = "avc1.42001E",
): YoutubeFormat =
    YoutubeFormat(
        formatId = formatId,
        url = "https://video.example/$formatId.mp4",
        protocol = protocol,
        acodec = acodec,
        vcodec = vcodec,
        height = height,
        ext = "mp4",
    )
