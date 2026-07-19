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
    private val lessonSnapshots = ConcurrentHashMap<UUID, ScheduledLessonResponse>()
    private val presenceBySession = ConcurrentHashMap<String, MutableMap<UUID, String>>()
    private val sessionLocks = ConcurrentHashMap<String, Any>()

    fun register(session: WebSocketSession, principal: LessonRealtimePrincipal) {
        sessions[session.id] = session
        principals[session.id] = principal
        sessionLocks.computeIfAbsent(session.id) { Any() }
        affectedPresenceLessons(principal.subject).forEach(::publishLessonPresence)
    }

    fun unregister(session: WebSocketSession) {
        val principal = principals[session.id]
        val affectedPresenceLessonIds = buildSet {
            addAll(presenceBySession[session.id].orEmpty().keys)
            if (principal != null) addAll(affectedPresenceLessons(principal.subject))
        }
        sessions.remove(session.id)
        principals.remove(session.id)
        presenceBySession.remove(session.id)
        sessionLocks.remove(session.id)
        subscriptionsBySession.remove(session.id).orEmpty().forEach { lessonId ->
            lessonSubscriptions[lessonId]?.let { subscribers ->
                subscribers.remove(session.id)
                if (subscribers.isEmpty()) {
                    lessonSubscriptions.remove(lessonId, subscribers)
                    lessonSnapshots.remove(lessonId)
                }
            }
        }
        affectedPresenceLessonIds.forEach(::publishLessonPresence)
    }

    fun subscribe(session: WebSocketSession, lesson: ScheduledLessonResponse) {
        lessonSnapshots[lesson.id] = lesson
        lessonSubscriptions.computeIfAbsent(lesson.id) { ConcurrentHashMap.newKeySet() }.add(session.id)
        subscriptionsBySession.computeIfAbsent(session.id) { ConcurrentHashMap.newKeySet() }.add(lesson.id)
        sendLessonPresence(session, lesson)
    }

    fun updatePresence(session: WebSocketSession, lesson: ScheduledLessonResponse, state: String) {
        lessonSnapshots[lesson.id] = lesson
        val sessionPresence = presenceBySession.computeIfAbsent(session.id) { ConcurrentHashMap() }
        if (state == LessonPresenceStates.CHECKING_DEVICES) {
            sessionPresence[lesson.id] = state
        } else {
            sessionPresence.remove(lesson.id)
            if (sessionPresence.isEmpty()) presenceBySession.remove(session.id, sessionPresence)
        }
        publishLessonPresence(lesson.id)
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
        if (lessonSubscriptions.containsKey(lesson.id)) lessonSnapshots[lesson.id] = lesson
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
        publishLessonPresence(lesson.id)
    }

    fun publishLessonDeleted(lessonId: UUID) {
        broadcastScheduleChanged()
        lessonSubscriptions[lessonId].orEmpty().forEach { sessionId ->
            sessions[sessionId]?.let { session ->
                sendToSession(session, LessonRealtimeOutboundMessage(type = "lesson.deleted", lessonId = lessonId))
            }
        }
        lessonSnapshots.remove(lessonId)
        presenceBySession.values.forEach { presence -> presence.remove(lessonId) }
    }

    fun broadcastScheduleChanged() {
        sessions.values.forEach { session ->
            sendToSession(session, LessonRealtimeOutboundMessage(type = "schedule.changed"))
        }
    }

    private fun publishLessonPresence(lessonId: UUID) {
        val lesson = lessonSnapshots[lessonId] ?: return
        lessonSubscriptions[lessonId].orEmpty().forEach { sessionId ->
            val session = sessions[sessionId] ?: return@forEach
            sendLessonPresence(session, lesson)
        }
    }

    private fun sendLessonPresence(session: WebSocketSession, lesson: ScheduledLessonResponse) {
        val principal = principals[session.id] ?: return
        if (!principal.canManagePresence()) return
        sendToSession(
            session,
            LessonRealtimeOutboundMessage(
                type = "lesson.presence",
                lessonId = lesson.id,
                participants = lesson.participants.map { participant ->
                    LessonParticipantPresence(
                        subject = participant.subject,
                        state = participantPresenceState(lesson.id, participant.subject),
                    )
                },
            ),
        )
    }

    private fun participantPresenceState(lessonId: UUID, subject: String): String {
        val subjectSessionIds = principals.entries
            .filter { (_, principal) -> principal.subject == subject }
            .map { (sessionId) -> sessionId }
        if (subjectSessionIds.isEmpty()) return LessonPresenceStates.OFFLINE
        return if (subjectSessionIds.any { sessionId ->
                presenceBySession[sessionId]?.get(lessonId) == LessonPresenceStates.CHECKING_DEVICES
            }
        ) {
            LessonPresenceStates.CHECKING_DEVICES
        } else {
            LessonPresenceStates.ONLINE
        }
    }

    private fun affectedPresenceLessons(subject: String): Set<UUID> =
        lessonSnapshots.values
            .filter { lesson -> lesson.participants.any { participant -> participant.subject == subject } }
            .mapTo(mutableSetOf()) { lesson -> lesson.id }

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
