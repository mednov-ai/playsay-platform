package com.playsay.gateway.config

import com.playsay.gateway.realtime.LessonRealtimeWebSocketHandler
import com.playsay.gateway.realtime.ChatRealtimeWebSocketHandler
import com.playsay.gateway.realtime.PLAY_SAY_WEBSOCKET_PROTOCOL
import com.playsay.gateway.realtime.authenticationAttribute
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
) : WebSocketConfigurer {
    override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
        registry.addHandler(lessonRealtimeWebSocketHandler, "/ws/lessons")
            .addInterceptors(lessonWebSocketAuthInterceptor)
            .setAllowedOriginPatterns(
                "https://online.play-and-say.ru",
                "http://localhost:[*]",
                "http://127.0.0.1:[*]",
            )
        registry.addHandler(chatRealtimeWebSocketHandler, "/ws/chat")
            .addInterceptors(lessonWebSocketAuthInterceptor)
            .setAllowedOriginPatterns(
                "https://online.play-and-say.ru",
                "http://localhost:[*]",
                "http://127.0.0.1:[*]",
            )
    }
}

@Component
class LessonWebSocketAuthInterceptor(
    private val jwtDecoder: JwtDecoder,
    private val jwtAuthenticationConverter: JwtAuthenticationConverter,
) : HandshakeInterceptor {
    override fun beforeHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        attributes: MutableMap<String, Any>,
    ): Boolean {
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
