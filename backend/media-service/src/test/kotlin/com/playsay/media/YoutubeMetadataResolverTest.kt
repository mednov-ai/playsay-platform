package com.playsay.media

import java.nio.file.Files
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class YoutubeMetadataResolverTest {
    @Test
    fun `reads large yt-dlp stdout while process is still running`() {
        val fakeYtdlp = Files.createTempFile("fake-ytdlp", ".sh")
        fakeYtdlp.writeText(
            """
            #!/usr/bin/env sh
            printf '{"id":"N2Au0UdymCU","duration":184,"language":"en","thumbnail":"https://i.ytimg.com/vi/N2Au0UdymCU/maxresdefault.jpg","formats":['
            i=0
            while [ "${'$'}i" -lt 2500 ]; do
              if [ "${'$'}i" -gt 0 ]; then printf ','; fi
              printf '{"format_id":"18-%s","url":"https://video.example/%s.mp4","protocol":"https","acodec":"mp4a.40.2","vcodec":"avc1.42001E","height":360,"ext":"mp4"}' "${'$'}i" "${'$'}i"
              i=${'$'}((i + 1))
            done
            printf ']}'
            """.trimIndent(),
        )
        fakeYtdlp.toFile().setExecutable(true)

        val resolved = YoutubeMetadataResolver(fakeYtdlp.toString()).resolve("N2Au0UdymCU")

        assertNotNull(resolved)
        assertEquals(184, resolved.durationSeconds)
        assertEquals("en", resolved.language)
        assertEquals("https://i.ytimg.com/vi/N2Au0UdymCU/maxresdefault.jpg", resolved.thumbnailUrl)
        assertEquals(2500, resolved.formats.size)
        assertEquals("18-0", resolved.formats.first().formatId)
    }
}
