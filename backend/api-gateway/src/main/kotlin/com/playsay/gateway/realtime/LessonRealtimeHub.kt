package com.playsay.gateway.realtime

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.ScheduledLessonResponse
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.springframework.stereotype.Component
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession

@Component
class LessonRealtimeHub(
    private val objectMapper: ObjectMapper,
) {
    private val sessions = ConcurrentHashMap<String, WebSocketSession>()
    private val principals = ConcurrentHashMap<String, LessonRealtimePrincipal>()
    private val lessonSubscriptions = ConcurrentHashMap<UUID, MutableSet<String>>()
    private val subscriptionsBySession = ConcurrentHashMap<String, MutableSet<UUID>>()
    private val sessionLocks = ConcurrentHashMap<String, Any>()

    fun register(session: WebSocketSession, principal: LessonRealtimePrincipal) {
        sessions[session.id] = session
        principals[session.id] = principal
        sessionLocks.computeIfAbsent(session.id) { Any() }
    }

    fun unregister(session: WebSocketSession) {
        sessions.remove(session.id)
        principals.remove(session.id)
        sessionLocks.remove(session.id)
        subscriptionsBySession.remove(session.id).orEmpty().forEach { lessonId ->
            lessonSubscriptions[lessonId]?.remove(session.id)
        }
    }

    fun subscribe(session: WebSocketSession, lessonId: UUID) {
        lessonSubscriptions.computeIfAbsent(lessonId) { ConcurrentHashMap.newKeySet() }.add(session.id)
        subscriptionsBySession.computeIfAbsent(session.id) { ConcurrentHashMap.newKeySet() }.add(lessonId)
    }

    fun sendConnected(session: WebSocketSession) {
        sendToSession(session, LessonRealtimeOutboundMessage(type = "connected"))
    }

    fun sendError(session: WebSocketSession, message: String) {
        sendToSession(session, LessonRealtimeOutboundMessage(type = "error", message = message))
    }

    fun sendLessonSnapshot(session: WebSocketSession, lesson: ScheduledLessonResponse) {
        sendToSession(session, LessonRealtimeOutboundMessage(type = "lesson.updated", lesson = lesson))
    }

    fun publishLessonUpdated(lesson: ScheduledLessonResponse) {
        broadcastScheduleChanged()
        lessonSubscriptions[lesson.id].orEmpty().forEach { sessionId ->
            val session = sessions[sessionId] ?: return@forEach
            val principal = principals[sessionId] ?: return@forEach
            val message = if (principal.canSee(lesson)) {
                LessonRealtimeOutboundMessage(type = "lesson.updated", lesson = lesson)
            } else {
                LessonRealtimeOutboundMessage(type = "lesson.deleted", lessonId = lesson.id)
            }
            sendToSession(session, message)
        }
    }

    fun publishLessonDeleted(lessonId: UUID) {
        broadcastScheduleChanged()
        lessonSubscriptions[lessonId].orEmpty().forEach { sessionId ->
            sessions[sessionId]?.let { session ->
                sendToSession(session, LessonRealtimeOutboundMessage(type = "lesson.deleted", lessonId = lessonId))
            }
        }
    }

    fun broadcastScheduleChanged() {
        sessions.values.forEach { session ->
            sendToSession(session, LessonRealtimeOutboundMessage(type = "schedule.changed"))
        }
    }

    private fun sendToSession(session: WebSocketSession, message: LessonRealtimeOutboundMessage) {
        if (!session.isOpen) {
            unregister(session)
            return
        }

        try {
            synchronized(sessionLocks.computeIfAbsent(session.id) { Any() }) {
                session.sendMessage(TextMessage(objectMapper.writeValueAsString(message)))
            }
        } catch (caught: Exception) {
            unregister(session)
        }
    }
}
