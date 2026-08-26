package com.playsay.gateway.realtime

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.ChatDeliveryReceiptResponse
import com.playsay.gateway.dto.ChatMessageResponse
import com.playsay.gateway.dto.ChatReadReceiptResponse
import com.playsay.gateway.dto.ChatUnreadStateResponse
import java.util.concurrent.ConcurrentHashMap
import org.springframework.stereotype.Component
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession

@JsonInclude(JsonInclude.Include.NON_NULL)
data class ChatRealtimeOutboundMessage(
    val type: String,
    val message: ChatMessageResponse? = null,
    val delivery: ChatDeliveryReceiptResponse? = null,
    val receipt: ChatReadReceiptResponse? = null,
    val unread: ChatUnreadStateResponse? = null,
)

@Component
class ChatRealtimeHub(
    private val objectMapper: ObjectMapper,
) {
    private val sessions = ConcurrentHashMap<String, WebSocketSession>()
    private val subjectSessions = ConcurrentHashMap<String, MutableSet<String>>()
    private val sessionSubjects = ConcurrentHashMap<String, String>()
    private val sessionLocks = ConcurrentHashMap<String, Any>()

    fun register(session: WebSocketSession, subject: String) {
        sessions[session.id] = session
        sessionSubjects[session.id] = subject
        subjectSessions.computeIfAbsent(subject) { ConcurrentHashMap.newKeySet() }.add(session.id)
        sessionLocks.computeIfAbsent(session.id) { Any() }
        send(session, ChatRealtimeOutboundMessage(type = "connected"))
    }

    fun unregister(session: WebSocketSession) {
        sessions.remove(session.id)
        sessionLocks.remove(session.id)
        sessionSubjects.remove(session.id)?.let { subject ->
            subjectSessions[subject]?.let { ids ->
                ids.remove(session.id)
                if (ids.isEmpty()) subjectSessions.remove(subject, ids)
            }
        }
    }

    fun isOnline(subject: String): Boolean = subjectSessions[subject]
        .orEmpty()
        .mapNotNull(sessions::get)
        .any(WebSocketSession::isOpen)

    fun publish(event: ChatMessageCreatedEvent): Boolean {
        val payload = ChatRealtimeOutboundMessage(type = "chat.message.created", message = event.message)
        broadcast(setOf(event.senderSubject), payload)
        return broadcast(setOf(event.recipientSubject), payload) > 0
    }

    fun publish(event: ChatConversationReadEvent) {
        broadcast(
            event.participantSubjects,
            ChatRealtimeOutboundMessage(type = "chat.conversation.read", receipt = event.receipt),
        )
    }

    fun publish(event: ChatUnreadChangedEvent) {
        broadcast(
            setOf(event.recipientSubject),
            ChatRealtimeOutboundMessage(type = "chat.unread.changed", unread = event.unread),
        )
    }

    fun publish(event: ChatMessagesDeliveredEvent) {
        broadcast(
            event.senderSubjects,
            ChatRealtimeOutboundMessage(type = "chat.messages.delivered", delivery = event.receipt),
        )
    }

    private fun broadcast(subjects: Set<String>, payload: ChatRealtimeOutboundMessage): Int =
        subjects.flatMap { subject -> subjectSessions[subject].orEmpty() }
            .distinct()
            .mapNotNull(sessions::get)
            .count { session -> send(session, payload) }

    private fun send(session: WebSocketSession, payload: ChatRealtimeOutboundMessage): Boolean {
        if (!session.isOpen) return false
        val text = TextMessage(objectMapper.writeValueAsString(payload))
        val lock = sessionLocks.computeIfAbsent(session.id) { Any() }
        return try {
            synchronized(lock) {
                if (session.isOpen) session.sendMessage(text)
            }
            session.isOpen
        } catch (_: Exception) {
            runCatching { session.close() }
            unregister(session)
            false
        }
    }
}
