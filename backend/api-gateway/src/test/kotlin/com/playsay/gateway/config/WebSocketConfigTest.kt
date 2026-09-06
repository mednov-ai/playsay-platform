package com.playsay.gateway.config

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.mockito.Mockito.mock
import org.springframework.http.HttpHeaders
import org.springframework.http.server.ServletServerHttpRequest
import org.springframework.http.server.ServletServerHttpResponse
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.web.socket.WebSocketHandler
import org.springframework.web.socket.server.support.OriginHandshakeInterceptor

class WebSocketConfigTest {
    @Test
    fun `parses exact current application origins and removes duplicates`() {
        val patterns = websocketAllowedOriginPatterns(
            """
            https://online.honey.school,
            https://online.honeyschool.ru,
            https://honeyschool.ru,
            https://online.honey.school
            """.trimIndent(),
        )

        assertEquals(
            listOf(
                "https://online.honey.school",
                "https://online.honeyschool.ru",
                "https://honeyschool.ru",
            ),
            patterns,
        )
    }

    @Test
    fun `keeps local wildcard ports without allowing legacy production origin`() {
        val patterns = websocketAllowedOriginPatterns(
            "http://localhost:[*],https://online.play-and-say.ru,http://127.0.0.1:[*]",
        )

        assertEquals(
            listOf("http://localhost:[*]", "http://127.0.0.1:[*]"),
            patterns,
        )
        check("https://online.play-and-say.ru" !in patterns)
    }

    @Test
    fun `rejects non-local wildcard origins`() {
        assertFailsWith<IllegalArgumentException> {
            websocketAllowedOriginPatterns("https://*.honeyschool.ru")
        }
    }

    @Test
    fun `rejects an empty deployed origin policy`() {
        assertFailsWith<IllegalArgumentException> {
            websocketAllowedOriginPatterns(" , ")
        }
    }

    @Test
    fun `spring handshake accepts only configured current browser origins`() {
        val configured = "https://online.honey.school,https://online.honeyschool.ru,https://honeyschool.ru"
        val policy = WebSocketOriginPolicy(configured)
        val interceptor = OriginHandshakeInterceptor().apply { allowedOriginPatterns = policy.patterns }

        assertTrue(policy.allows("https://online.honey.school"))
        assertTrue(policy.allows("https://online.honeyschool.ru"))
        assertTrue(policy.allows("https://honeyschool.ru"))
        assertFalse(policy.allows("https://www.honeyschool.ru"))
        assertFalse(policy.allows("https://online.play-and-say.ru"))
        assertTrue(interceptor.accepts("https://online.honey.school"))
        assertTrue(interceptor.accepts("https://online.honeyschool.ru"))
        assertTrue(interceptor.accepts("https://honeyschool.ru"))
        assertFalse(interceptor.accepts("https://www.honeyschool.ru"))
        assertFalse(interceptor.accepts("https://online.play-and-say.ru"))
    }

    @Test
    fun `local origin policy accepts arbitrary explicit ports only`() {
        val policy = WebSocketOriginPolicy("http://localhost:[*],http://127.0.0.1:[*]")

        assertTrue(policy.allows("http://localhost:5173"))
        assertTrue(policy.allows("http://127.0.0.1:4173"))
        assertFalse(policy.allows("http://localhost"))
        assertFalse(policy.allows("https://localhost:5173"))
        assertFalse(policy.allows(null))
    }

    @Test
    fun `regional dev origin must be explicitly configured`() {
        val dev = WebSocketOriginPolicy(
            "https://dev.online.honey.school,https://dev.online.honeyschool.ru",
        )
        val prod = WebSocketOriginPolicy("https://online.honey.school,https://online.honeyschool.ru")

        assertTrue(dev.allows("https://dev.online.honeyschool.ru"))
        assertFalse(dev.allows("https://online.honeyschool.ru"))
        assertFalse(prod.allows("https://dev.online.honeyschool.ru"))
    }

    private fun OriginHandshakeInterceptor.accepts(origin: String): Boolean {
        val servletRequest = MockHttpServletRequest("GET", "/ws/lessons").apply {
            scheme = "https"
            serverName = "api.internal"
            serverPort = 443
            addHeader(HttpHeaders.ORIGIN, origin)
        }
        return beforeHandshake(
            ServletServerHttpRequest(servletRequest),
            ServletServerHttpResponse(MockHttpServletResponse()),
            mock(WebSocketHandler::class.java),
            mutableMapOf(),
        )
    }
}
