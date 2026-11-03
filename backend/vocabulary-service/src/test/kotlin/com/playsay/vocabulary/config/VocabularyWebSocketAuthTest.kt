package com.playsay.vocabulary.config

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.http.HttpHeaders
import org.springframework.http.server.ServletServerHttpRequest
import org.springframework.http.server.ServletServerHttpResponse
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter
import org.springframework.web.socket.WebSocketHandler

class VocabularyWebSocketAuthTest {
    @Test
    fun `websocket handshake requires a nonblank token subject`() {
        val decoder = mock(JwtDecoder::class.java)
        val interceptor = VocabularyWebSocketAuthInterceptor(
            decoder,
            JwtAuthenticationConverter(),
            VocabularyWebSocketOriginPolicy("https://online.honey.school"),
        )
        val request = MockHttpServletRequest("GET", "/ws/vocabulary").apply {
            addHeader(HttpHeaders.ORIGIN, "https://online.honey.school")
            addHeader("Sec-WebSocket-Protocol", "playsay, token")
        }
        `when`(decoder.decode("token")).thenReturn(
            Jwt.withTokenValue("token").header("alg", "none").claim("test", "value").build(),
        )
        val attributes = mutableMapOf<String, Any>()

        assertFalse(
            interceptor.beforeHandshake(
                ServletServerHttpRequest(request), ServletServerHttpResponse(MockHttpServletResponse()),
                mock(WebSocketHandler::class.java), attributes,
            ),
        )
        assertTrue(attributes.isEmpty())

        `when`(decoder.decode("token")).thenReturn(
            Jwt.withTokenValue("token").header("alg", "none").subject("student-1").build(),
        )
        assertTrue(
            interceptor.beforeHandshake(
                ServletServerHttpRequest(request), ServletServerHttpResponse(MockHttpServletResponse()),
                mock(WebSocketHandler::class.java), attributes,
            ),
        )
    }
}
