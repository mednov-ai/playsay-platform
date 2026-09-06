package com.playsay.gateway.config

import com.playsay.gateway.realtime.LessonRealtimeWebSocketHandler
import com.playsay.gateway.realtime.ChatRealtimeWebSocketHandler
import com.playsay.gateway.realtime.PLAY_SAY_WEBSOCKET_PROTOCOL
import com.playsay.gateway.realtime.authenticationAttribute
import java.net.URI
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Configuration
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

@Configuration
@EnableWebSocket
class WebSocketConfig(
    private val lessonRealtimeWebSocketHandler: LessonRealtimeWebSocketHandler,
    private val chatRealtimeWebSocketHandler: ChatRealtimeWebSocketHandler,
    private val lessonWebSocketAuthInterceptor: LessonWebSocketAuthInterceptor,
    private val webSocketOriginPolicy: WebSocketOriginPolicy,
) : WebSocketConfigurer {
    override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
        val allowedOriginPatterns = webSocketOriginPolicy.patterns.toTypedArray()
        registry.addHandler(lessonRealtimeWebSocketHandler, "/ws/lessons")
            .addInterceptors(lessonWebSocketAuthInterceptor)
            .setAllowedOriginPatterns(*allowedOriginPatterns)
        registry.addHandler(chatRealtimeWebSocketHandler, "/ws/chat")
            .addInterceptors(lessonWebSocketAuthInterceptor)
            .setAllowedOriginPatterns(*allowedOriginPatterns)
    }
}

internal fun websocketAllowedOriginPatterns(configured: String): List<String> =
    configured
        .split(",")
        .map(String::trim)
        .filter(String::isNotEmpty)
        .filter { pattern -> pattern in supportedWebSocketOriginPatterns }
        .distinct()
        .also { patterns ->
            require(patterns.isNotEmpty()) { "playsay.websocket.allowed-origin-patterns must not be empty" }
        }

private val supportedWebSocketOriginPatterns = setOf(
    "https://dev.online.honey.school",
    "https://dev.online.honeyschool.ru",
    "https://online.honey.school",
    "https://online.honeyschool.ru",
    "https://honeyschool.ru",
    "http://localhost:[*]",
    "http://127.0.0.1:[*]",
)

@Component
class WebSocketOriginPolicy(
    @Value("\${playsay.websocket.allowed-origin-patterns}") configured: String,
) {
    val patterns: List<String> = websocketAllowedOriginPatterns(configured)

    fun allows(origin: String?): Boolean {
        val normalizedOrigin = origin?.trim()?.trimEnd('/')?.takeIf(String::isNotEmpty) ?: return false
        if (normalizedOrigin in patterns) return true
        val parsed = runCatching { URI(normalizedOrigin) }.getOrNull() ?: return false
        return parsed.scheme == "http" && parsed.port >= 0 && when (parsed.host) {
            "localhost" -> "http://localhost:[*]" in patterns
            "127.0.0.1" -> "http://127.0.0.1:[*]" in patterns
            else -> false
        }
    }
}

@Component
class LessonWebSocketAuthInterceptor(
    private val jwtDecoder: JwtDecoder,
    private val jwtAuthenticationConverter: JwtAuthenticationConverter,
    private val webSocketOriginPolicy: WebSocketOriginPolicy,
) : HandshakeInterceptor {
    override fun beforeHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        attributes: MutableMap<String, Any>,
    ): Boolean {
        if (!webSocketOriginPolicy.allows(request.headers.origin)) {
            return false
        }
        val protocols = request.headers["Sec-WebSocket-Protocol"]
            .orEmpty()
            .flatMap { header -> header.split(",") }
            .map { protocol -> protocol.trim() }
        if (PLAY_SAY_WEBSOCKET_PROTOCOL !in protocols) {
            return false
        }

        val token = protocols.firstOrNull { protocol -> protocol.isNotEmpty() && protocol != PLAY_SAY_WEBSOCKET_PROTOCOL }
            ?: return false

        return try {
            val authentication = jwtAuthenticationConverter.convert(jwtDecoder.decode(token)) as? JwtAuthenticationToken
                ?: return false
            attributes[authenticationAttribute] = authentication
            true
        } catch (caught: JwtException) {
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
