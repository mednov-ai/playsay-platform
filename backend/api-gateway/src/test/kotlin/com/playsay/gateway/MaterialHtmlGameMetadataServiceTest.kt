package com.playsay.gateway

import com.playsay.gateway.service.MaterialHtmlGameMetadataService
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MaterialHtmlGameMetadataServiceTest {
    private val service = MaterialHtmlGameMetadataService()

    @Test
    fun `prefers document title and extracts only visible context`() {
        val metadata = service.extract(
            """
            <html><head><title>Word Race</title><style>.secret { color: red }</style></head>
            <body><h1>Match the animals</h1><button>Start</button><script>const token = 'hidden'</script></body></html>
            """.trimIndent().toByteArray(),
            "index.html",
        )
        assertEquals("Word Race", metadata.title)
        assertEquals("Word Race", metadata.displayTitle)
        assertEquals("HTML", metadata.titleSource)
        assertFalse(metadata.titleNeedsAi)
        assertTrue(metadata.context.contains("Match the animals"))
        assertFalse(metadata.context.contains("hidden"))
    }

    @Test
    fun `marks generic title for ai improvement`() {
        val metadata = service.extract("<html><head><title>Game</title></head><body></body></html>".toByteArray(), "index.html")
        assertEquals("Game", metadata.title)
        assertEquals("New game", metadata.displayTitle)
        assertTrue(metadata.titleNeedsAi)
    }

    @Test
    fun `keeps non english title only as ai context and exposes english fallback`() {
        val metadata = service.extract(
            "<html><head><title>Найди рифму</title></head><body><h1>Найди пары слов</h1></body></html>".toByteArray(),
            "index.html",
        )
        assertEquals("Найди рифму", metadata.title)
        assertEquals("New game", metadata.displayTitle)
        assertTrue(metadata.titleNeedsAi)
        assertTrue(metadata.context.contains("Найди пары слов"))
    }
}
