package com.playsay.gateway

import com.playsay.gateway.service.classifyHtmlGameCompatibility
import kotlin.test.Test
import kotlin.test.assertEquals

class MaterialHtmlGameCompatibilityTest {
    @Test
    fun `classifies SDK manifest before legacy heuristics`() {
        val html = """
            <html><head>
              <script type="application/playsay-game+json">
                {"protocol":"playsay-game-sync/v1","gameId":"quiz"}
              </script>
            </head><body><script>PlaySayGameSync.defineGame({})</script></body></html>
        """.trimIndent()
        assertEquals("SDK_V1", classifyHtmlGameCompatibility(html))
    }

    @Test
    fun `routes network dependent games to authority mirror`() {
        assertEquals(
            "LEGACY_MIRROR",
            classifyHtmlGameCompatibility("<html><script>fetch('/state')</script></html>"),
        )
    }

    @Test
    fun `keeps self contained interactive games predictive`() {
        assertEquals(
            "LEGACY_PREDICTIVE",
            classifyHtmlGameCompatibility("<html><button>Start</button></html>"),
        )
    }
}
