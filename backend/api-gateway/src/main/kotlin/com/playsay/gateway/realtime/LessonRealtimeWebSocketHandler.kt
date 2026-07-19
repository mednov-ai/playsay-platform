package com.playsay.gateway.realtime

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.playsay.gateway.service.ScheduledLessonStore
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.SubProtocolCapable
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler
import org.springframework.web.server.ResponseStatusException

@Component
class LessonRealtimeWebSocketHandler(
    private val store: ScheduledLessonStore,
    private val hub: LessonRealtimeHub,
    private val objectMapper: ObjectMapper,
) : TextWebSocketHandler(), SubProtocolCapable {
    override fun getSubProtocols(): List<String> = listOf(PLAY_SAY_WEBSOCKET_PROTOCOL)

    override fun afterConnectionEstablished(session: WebSocketSession) {
        val authentication = session.authentication()
        if (authentication == null) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("Authentication is required."))
            return
        }

        hub.register(
            session,
            authentication.lessonRealtimePrincipal(),
        )
        hub.sendConnected(session)
    }

    override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
        val authentication = session.authentication()
        if (authentication == null) {
            hub.sendError(session, "Authentication is required.")
            session.close(CloseStatus.NOT_ACCEPTABLE)
            return
        }

        val inbound = try {
            objectMapper.readValue<LessonRealtimeInboundMessage>(message.payload)
        } catch (caught: Exception) {
            hub.sendError(session, "Invalid realtime message.")
            return
        }

        when (inbound.type) {
            "subscribe.lesson" -> subscribeToLesson(session, authentication, inbound.lessonId)
            "presence.update" -> updatePresence(session, authentication, inbound.lessonId, inbound.state)
            else -> hub.sendError(session, "Unsupported realtime message.")
        }
    }

    override fun handleTransportError(session: WebSocketSession, exception: Throwable) {
        hub.unregister(session)
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        hub.unregister(session)
    }

    private fun subscribeToLesson(
        session: WebSocketSession,
        authentication: JwtAuthenticationToken,
        lessonId: UUID?,
    ) {
        if (lessonId == null) {
            hub.sendError(session, "lessonId is required.")
            return
        }

        try {
            val lesson = store.get(authentication, lessonId)
            hub.subscribe(session, lesson)
            hub.sendLessonSnapshot(session, lesson)
        } catch (caught: ResponseStatusException) {
            hub.sendError(session, caught.reason ?: "Lesson is not available.")
        }
    }

    private fun updatePresence(
        session: WebSocketSession,
        authentication: JwtAuthenticationToken,
        lessonId: UUID?,
        state: String?,
    ) {
        val validLessonId = lessonId
        val validState = state?.takeIf { value -> value in LessonPresenceStates.reportable }
        if (validLessonId == null || validState == null) {
            hub.sendError(session, "Valid lessonId and presence state are required.")
            return
        }

        try {
            val lesson = store.get(authentication, validLessonId)
            if (!authentication.lessonRealtimePrincipal().canReportPresence(lesson)) {
                hub.sendError(session, "Lesson presence is not available.")
                return
            }
            hub.updatePresence(session, lesson, validState)
        } catch (caught: ResponseStatusException) {
            hub.sendError(session, caught.reason ?: "Lesson is not available.")
        }
    }

    private fun WebSocketSession.authentication(): JwtAuthenticationToken? =
        attributes[authenticationAttribute] as? JwtAuthenticationToken

    private fun JwtAuthenticationToken.lessonRealtimePrincipal(): LessonRealtimePrincipal =
        LessonRealtimePrincipal(
            subject = token.subject,
            roles = authorities.mapNotNull { authority ->
                authority.authority?.removePrefix(MetaData.Authorities.PREFIX)?.takeIf { it in applicationRoles }
            }.toSet(),
        )

    private companion object {
        val applicationRoles = setOf(MetaData.Roles.STUDENT, MetaData.Roles.TEACHER, MetaData.Roles.ADMIN)
    }
}

const val PLAY_SAY_WEBSOCKET_PROTOCOL = "playsay"
const val authenticationAttribute = "playsay.authentication"
