package com.playsay.vocabulary.config

import com.playsay.vocabulary.realtime.PLAY_SAY_WEBSOCKET_PROTOCOL
import com.playsay.vocabulary.realtime.VocabularyRealtimeWebSocketHandler
import com.playsay.vocabulary.realtime.authenticationAttribute
import java.net.URI
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.server.ServerHttpRequest
import org.springframework.http.server.ServerHttpResponse
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.web.socket.WebSocketHandler
import org.springframework.web.socket.config.annotation.EnableWebSocket
import org.springframework.web.socket.config.annotation.WebSocketConfigurer
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry
import org.springframework.web.socket.server.HandshakeInterceptor

@org.springframework.context.annotation.Configuration
@EnableWebSocket
class VocabularyWebSocketConfig(
    private val handler: VocabularyRealtimeWebSocketHandler,
    private val authInterceptor: VocabularyWebSocketAuthInterceptor,
    private val originPolicy: VocabularyWebSocketOriginPolicy,
) : WebSocketConfigurer {
    override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
        registry.addHandler(handler, "/api/vocabulary/ws")
            .addInterceptors(authInterceptor)
            .setAllowedOriginPatterns(*originPolicy.patterns.toTypedArray())
    }
}

@Component
class VocabularyWebSocketOriginPolicy(
    @Value("\${playsay.websocket.allowed-origin-patterns}") configured: String,
) {
    val patterns = configured.split(",").map(String::trim).filter(String::isNotEmpty).distinct()

    init {
        require(patterns.isNotEmpty()) { "playsay.websocket.allowed-origin-patterns must not be empty" }
    }

    fun allows(origin: String?): Boolean {
        val normalized = origin?.trim()?.trimEnd('/')?.takeIf(String::isNotEmpty) ?: return false
        if (normalized in patterns) return true
        val parsed = runCatching { URI(normalized) }.getOrNull() ?: return false
        return parsed.scheme == "http" && parsed.port >= 0 && when (parsed.host) {
            "localhost" -> "http://localhost:[*]" in patterns
            "127.0.0.1" -> "http://127.0.0.1:[*]" in patterns
            else -> false
        }
    }
}

@Component
class VocabularyWebSocketAuthInterceptor(
    private val jwtDecoder: JwtDecoder,
    private val jwtAuthenticationConverter: JwtAuthenticationConverter,
    private val originPolicy: VocabularyWebSocketOriginPolicy,
) : HandshakeInterceptor {
    override fun beforeHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        attributes: MutableMap<String, Any>,
    ): Boolean {
        if (!originPolicy.allows(request.headers.origin)) return false
        val protocols = request.headers["Sec-WebSocket-Protocol"]
            .orEmpty()
            .flatMap { header -> header.split(",") }
            .map(String::trim)
        if (PLAY_SAY_WEBSOCKET_PROTOCOL !in protocols) return false
        val token = protocols.firstOrNull { protocol ->
            protocol.isNotEmpty() && protocol != PLAY_SAY_WEBSOCKET_PROTOCOL
        } ?: return false
        return try {
            val authentication = jwtAuthenticationConverter.convert(jwtDecoder.decode(token))
                as? JwtAuthenticationToken
                ?: return false
            attributes[authenticationAttribute] = authentication
            true
        } catch (_: JwtException) {
            false
        }
    }

    override fun afterHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        exception: Exception?,
    ) = Unit
}
