package com.playsay.vocabulary.realtime

import com.fasterxml.jackson.databind.ObjectMapper
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.springframework.stereotype.Component
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession

@Component
class VocabularyRealtimeHub(
    private val objectMapper: ObjectMapper,
) {
    private val sessions = ConcurrentHashMap<String, WebSocketSession>()
    private val sessionSubjects = ConcurrentHashMap<String, String>()
    private val subscriptions = ConcurrentHashMap<String, VocabularySubscription>()
    private val sessionLocks = ConcurrentHashMap<String, Any>()

    fun register(session: WebSocketSession, subject: String) {
        sessions[session.id] = session
        sessionSubjects[session.id] = subject
        sessionLocks.computeIfAbsent(session.id) { Any() }
        send(session, VocabularyRealtimeOutboundMessage(type = "connected"))
    }

    fun unregister(session: WebSocketSession) {
        sessions.remove(session.id)
        sessionSubjects.remove(session.id)
        subscriptions.remove(session.id)
        sessionLocks.remove(session.id)
    }

    fun subscribe(session: WebSocketSession, ownerSubject: String, lessonId: UUID?) {
        subscriptions[session.id] = VocabularySubscription(ownerSubject, lessonId)
        send(
            session,
            VocabularyRealtimeOutboundMessage(
                type = "vocabulary.subscribed",
                ownerSubject = ownerSubject,
                lessonId = lessonId,
            ),
        )
    }

    fun sendError(session: WebSocketSession, message: String) {
        send(session, VocabularyRealtimeOutboundMessage(type = "error", message = message))
    }

    fun publish(event: VocabularyEntryChangedEvent) {
        val payload = VocabularyRealtimeOutboundMessage(
            type = event.type,
            ownerSubject = event.ownerSubject,
            lessonId = event.lessonId,
            actorSubject = event.actorSubject,
            entry = event.entry,
        )
        subscriptions
            .filterValues { subscription -> subscription.ownerSubject == event.ownerSubject }
            .keys
            .mapNotNull(sessions::get)
            .forEach { session -> send(session, payload) }
    }

    private fun send(session: WebSocketSession, payload: VocabularyRealtimeOutboundMessage): Boolean {
        if (!session.isOpen) return false
        val lock = sessionLocks.computeIfAbsent(session.id) { Any() }
        return try {
            synchronized(lock) {
                if (session.isOpen) {
                    session.sendMessage(TextMessage(objectMapper.writeValueAsString(payload)))
                }
            }
            session.isOpen
        } catch (_: Exception) {
            runCatching { session.close() }
            unregister(session)
            false
        }
    }
}

private data class VocabularySubscription(
    val ownerSubject: String,
    val lessonId: UUID?,
)
