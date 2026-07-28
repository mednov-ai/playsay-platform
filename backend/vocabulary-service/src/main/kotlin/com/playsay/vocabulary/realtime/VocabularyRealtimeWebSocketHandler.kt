package com.playsay.vocabulary.realtime

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.playsay.vocabulary.service.VocabularyAccessService
import com.playsay.vocabulary.service.VocabularyPracticeService
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.SubProtocolCapable
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler
import org.springframework.web.server.ResponseStatusException

@Component
class VocabularyRealtimeWebSocketHandler(
    private val access: VocabularyAccessService,
    private val practices: VocabularyPracticeService,
    private val hub: VocabularyRealtimeHub,
    private val objectMapper: ObjectMapper,
) : TextWebSocketHandler(), SubProtocolCapable {
    override fun getSubProtocols(): List<String> = listOf(PLAY_SAY_WEBSOCKET_PROTOCOL)

    override fun afterConnectionEstablished(session: WebSocketSession) {
        val authentication = session.authentication()
        if (authentication == null) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("Authentication is required."))
            return
        }
        hub.register(session, authentication.token.subject)
    }

    override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
        val authentication = session.authentication()
        if (authentication == null) {
            hub.sendError(session, "Authentication is required.")
            return
        }
        val inbound = runCatching {
            objectMapper.readValue<VocabularyRealtimeInboundMessage>(message.payload)
        }.getOrElse {
            hub.sendError(session, "Invalid realtime message.")
            return
        }
        try {
            when (inbound.type) {
                "vocabulary.subscribe" -> {
                    if (inbound.ownerSubject.isNullOrBlank()) {
                        hub.sendError(session, "A vocabulary owner is required.")
                        return
                    }
                    val owner = access.requireOwnerAccess(
                        authentication.token.subject,
                        inbound.ownerSubject.trim(),
                        inbound.lessonId,
                    )
                    hub.subscribe(session, owner, inbound.lessonId)
                }
                "vocabulary.practice.subscribe" -> {
                    val practiceId = inbound.practiceId
                    if (practiceId == null) {
                        hub.sendError(session, "A vocabulary practice is required.")
                        return
                    }
                    val practice = practices.requirePracticeSubscription(authentication.token.subject, practiceId)
                    hub.subscribePractice(session, practiceId, practice.lessonId)
                }
                else -> hub.sendError(session, "A vocabulary subscription is required.")
            }
        } catch (caught: ResponseStatusException) {
            hub.sendError(session, caught.reason ?: "Vocabulary is not available.")
        }
    }

    override fun handleTransportError(session: WebSocketSession, exception: Throwable) {
        hub.unregister(session)
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        hub.unregister(session)
    }

    private fun WebSocketSession.authentication(): JwtAuthenticationToken? =
        attributes[authenticationAttribute] as? JwtAuthenticationToken
}

const val PLAY_SAY_WEBSOCKET_PROTOCOL = "playsay"
const val authenticationAttribute = "playsay.vocabulary.authentication"
