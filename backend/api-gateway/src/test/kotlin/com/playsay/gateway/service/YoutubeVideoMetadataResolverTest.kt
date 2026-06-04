package com.playsay.gateway.service

import java.nio.file.Files
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class YoutubeVideoMetadataResolverTest {
    @Test
    fun `resolves duration and language from yt-dlp print output`() {
        val ytdlp = Files.createTempFile("playsay-ytdlp-meta", ".sh")
        ytdlp.writeText(
            """
            #!/usr/bin/env sh
            printf '%s\n' 'N2Au0UdymCU'
            printf '%s\n' '105'
            printf '%s\n' 'en'
            """.trimIndent(),
        )
        ytdlp.toFile().setExecutable(true)

        val meta = YoutubeVideoMetadataResolver(ytdlpPath = ytdlp.toString()).resolve("N2Au0UdymCU")

        assertEquals("N2Au0UdymCU", meta?.videoId)
        assertEquals(105, meta?.durationSeconds)
        assertEquals("en", meta?.language)
    }

    @Test
    fun `treats unavailable language as missing`() {
        val ytdlp = Files.createTempFile("playsay-ytdlp-meta", ".sh")
        ytdlp.writeText(
            """
            #!/usr/bin/env sh
            printf '%s\n' 'N2Au0UdymCU'
            printf '%s\n' '105'
            printf '%s\n' 'NA'
            """.trimIndent(),
        )
        ytdlp.toFile().setExecutable(true)

        val meta = YoutubeVideoMetadataResolver(ytdlpPath = ytdlp.toString()).resolve("N2Au0UdymCU")

        assertEquals(105, meta?.durationSeconds)
        assertNull(meta?.language)
    }

    @Test
    fun `returns null when yt dlp metadata command fails`() {
        val ytdlp = Files.createTempFile("playsay-ytdlp-meta", ".sh")
        ytdlp.writeText(
            """
            #!/usr/bin/env sh
            exit 1
            """.trimIndent(),
        )
        ytdlp.toFile().setExecutable(true)

        val meta = YoutubeVideoMetadataResolver(ytdlpPath = ytdlp.toString()).resolve("N2Au0UdymCU")

        assertNull(meta)
    }
}
