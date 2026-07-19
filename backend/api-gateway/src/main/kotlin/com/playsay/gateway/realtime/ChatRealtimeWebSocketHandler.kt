package com.playsay.gateway.realtime

import com.playsay.gateway.service.ChatDeliveryService
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler

@Component
class ChatRealtimeWebSocketHandler(
    private val hub: ChatRealtimeHub,
    private val deliveryService: ChatDeliveryService,
) : TextWebSocketHandler() {
    override fun afterConnectionEstablished(session: WebSocketSession) {
        val authentication = session.attributes[authenticationAttribute] as? JwtAuthenticationToken
        if (authentication == null) {
            session.close(CloseStatus.NOT_ACCEPTABLE)
            return
        }
        val subject = authentication.token.subject
        hub.register(session, subject)
        deliveryService.deliverPending(subject)
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        hub.unregister(session)
    }

    override fun handleTransportError(session: WebSocketSession, exception: Throwable) {
        hub.unregister(session)
        if (session.isOpen) session.close(CloseStatus.SERVER_ERROR)
    }
}
