package com.playsay.vocabulary.realtime

import com.fasterxml.jackson.databind.ObjectMapper
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet
import org.springframework.stereotype.Component
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import io.micrometer.core.instrument.MeterRegistry

@Component
class VocabularyRealtimeHub(
    private val objectMapper: ObjectMapper,
    private val meters: MeterRegistry,
) {
    private val sessions = ConcurrentHashMap<String, WebSocketSession>()
    private val sessionSubjects = ConcurrentHashMap<String, String>()
    private val subscriptions = ConcurrentHashMap<String, CopyOnWriteArraySet<VocabularySubscription>>()
    private val sessionLocks = ConcurrentHashMap<String, Any>()

    fun register(session: WebSocketSession, subject: String) {
        sessions[session.id] = session
        sessionSubjects[session.id] = subject
        sessionLocks.computeIfAbsent(session.id) { Any() }
        send(session, VocabularyRealtimeOutboundMessage(type = "connected"))
        meters.counter("playsay.vocabulary.live.connection", "event", "connected").increment()
    }

    fun unregister(session: WebSocketSession) {
        sessions.remove(session.id)
        sessionSubjects.remove(session.id)
        subscriptions.remove(session.id)
        sessionLocks.remove(session.id)
        meters.counter("playsay.vocabulary.live.connection", "event", "disconnected").increment()
    }

    fun subscribe(session: WebSocketSession, ownerSubject: String, lessonId: UUID?) {
        subscriptions.computeIfAbsent(session.id) { CopyOnWriteArraySet() }
            .add(VocabularySubscription(ownerSubject = ownerSubject, lessonId = lessonId))
        send(
            session,
            VocabularyRealtimeOutboundMessage(
                type = "vocabulary.subscribed",
                ownerSubject = ownerSubject,
                lessonId = lessonId,
            ),
        )
    }

    fun subscribePractice(session: WebSocketSession, practiceId: UUID, lessonId: UUID?) {
        subscriptions.computeIfAbsent(session.id) { CopyOnWriteArraySet() }
            .add(VocabularySubscription(practiceId = practiceId, lessonId = lessonId))
        send(
            session,
            VocabularyRealtimeOutboundMessage(
                type = "vocabulary.practice.subscribed",
                practiceId = practiceId,
                lessonId = lessonId,
            ),
        )
        meters.counter("playsay.vocabulary.live.connection", "event", "practice_subscribed").increment()
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
            .filterValues { sessionSubscriptions -> sessionSubscriptions.any { it.ownerSubject == event.ownerSubject } }
            .keys
            .mapNotNull(sessions::get)
            .forEach { session -> send(session, payload) }
    }

    fun publish(event: VocabularyPracticeChangedEvent) {
        val payload = VocabularyRealtimeOutboundMessage(
            type = event.type,
            practiceId = event.practiceId,
            lessonId = event.lessonId,
            sessionId = event.sessionId,
            actorSubject = event.actorSubject,
            practice = event.practice,
        )
        subscriptions.forEach { (sessionId, sessionSubscriptions) ->
            val recipientSubject = sessionSubjects[sessionId]
            val subscribedToPractice = sessionSubscriptions.any { it.practiceId == event.practiceId }
            val subscribedToOwnOwner = recipientSubject in event.ownerSubjects &&
                sessionSubscriptions.any { it.ownerSubject == recipientSubject }
            if (subscribedToPractice || subscribedToOwnOwner) {
                val session = sessions[sessionId] ?: return@forEach
                val ownSession = event.practice.sessions.firstOrNull { it.ownerSubject == recipientSubject }
                val recipientPayload = if (ownSession == null) {
                    payload
                } else {
                    payload.copy(practice = event.practice.copy(sessions = listOf(ownSession)))
                }
                send(session, recipientPayload)
            }
        }
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
    val ownerSubject: String? = null,
    val lessonId: UUID? = null,
    val practiceId: UUID? = null,
)
