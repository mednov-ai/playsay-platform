package com.playsay.gateway.realtime

import com.playsay.gateway.service.ChatDeliveryService
import kotlin.test.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.WebSocketSession

class ChatRealtimeWebSocketHandlerTest {
    @Test
    fun `mixed role registers and recovers pending messages while pure admin is rejected`() {
        for (roles in listOf(listOf("ROLE_ADMIN", "ROLE_TEACHER"), listOf("ROLE_STUDENT"), listOf("ROLE_ADMIN"))) {
            val hub = mock(ChatRealtimeHub::class.java)
            val delivery = mock(ChatDeliveryService::class.java)
            val session = mock(WebSocketSession::class.java)
            val jwt = Jwt.withTokenValue("test").header("alg", "none").subject("test-subject").build()
            val auth = JwtAuthenticationToken(jwt, roles.map(::SimpleGrantedAuthority))
            `when`(session.attributes).thenReturn(mutableMapOf<String, Any>(authenticationAttribute to auth))
            ChatRealtimeWebSocketHandler(hub, delivery).afterConnectionEstablished(session)
            if (roles == listOf("ROLE_ADMIN")) {
                verify(session).close(CloseStatus.NOT_ACCEPTABLE)
                verifyNoInteractions(hub, delivery)
            } else {
                verify(hub).register(session, "test-subject")
                verify(delivery).deliverPending("test-subject")
            }
        }
    }
}
