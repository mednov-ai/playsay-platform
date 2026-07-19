package com.playsay.gateway.realtime

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.ScheduledLessonParticipantResponse
import com.playsay.gateway.dto.ScheduledLessonResponse
import java.net.InetSocketAddress
import java.net.URI
import java.security.Principal
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.springframework.http.HttpHeaders
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketExtension
import org.springframework.web.socket.WebSocketMessage
import org.springframework.web.socket.WebSocketSession

class LessonRealtimeHubTest {
    private val objectMapper = jacksonObjectMapper()

    @Test
    fun `completed lesson update closes subscribed student session`() {
        val hub = LessonRealtimeHub(objectMapper)
        val lessonId = UUID.randomUUID()
        val studentSession = RecordingWebSocketSession()

        hub.register(studentSession, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        hub.subscribe(studentSession, lesson(id = lessonId, status = "SCHEDULED", participantSubjects = listOf("student-1")))

        hub.publishLessonUpdated(lesson(id = lessonId, status = "COMPLETED", participantSubjects = listOf("student-1")))

        val lastMessage = objectMapper.readTree(studentSession.sentMessages.last())
        assertEquals("lesson.deleted", lastMessage["type"].asText())
        assertEquals(lessonId.toString(), lastMessage["lessonId"].asText())
    }

    @Test
    fun `teacher receives offline online and checking device presence snapshots`() {
        val hub = LessonRealtimeHub(objectMapper)
        val activeLesson = lesson(id = UUID.randomUUID(), status = "IN_PROGRESS", participantSubjects = listOf("student-1"))
        val teacherSession = RecordingWebSocketSession()
        val firstStudentSession = RecordingWebSocketSession()
        val secondStudentSession = RecordingWebSocketSession()

        hub.register(teacherSession, LessonRealtimePrincipal(subject = "teacher-1", roles = setOf("TEACHER")))
        hub.subscribe(teacherSession, activeLesson)
        assertPresence(teacherSession, LessonPresenceStates.OFFLINE)

        hub.register(firstStudentSession, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        assertPresence(teacherSession, LessonPresenceStates.ONLINE)

        hub.register(secondStudentSession, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        hub.updatePresence(firstStudentSession, activeLesson, LessonPresenceStates.CHECKING_DEVICES)
        assertPresence(teacherSession, LessonPresenceStates.CHECKING_DEVICES)

        hub.updatePresence(firstStudentSession, activeLesson, LessonPresenceStates.ONLINE)
        assertPresence(teacherSession, LessonPresenceStates.ONLINE)

        hub.unregister(firstStudentSession)
        assertPresence(teacherSession, LessonPresenceStates.ONLINE)
        hub.unregister(secondStudentSession)
        assertPresence(teacherSession, LessonPresenceStates.OFFLINE)

        val reconnectedStudentSession = RecordingWebSocketSession()
        hub.register(reconnectedStudentSession, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        assertPresence(teacherSession, LessonPresenceStates.ONLINE)
        hub.updatePresence(reconnectedStudentSession, activeLesson, LessonPresenceStates.CHECKING_DEVICES)
        assertPresence(teacherSession, LessonPresenceStates.CHECKING_DEVICES)
    }

    @Test
    fun `student subscribers never receive participant presence`() {
        val hub = LessonRealtimeHub(objectMapper)
        val activeLesson = lesson(id = UUID.randomUUID(), status = "IN_PROGRESS", participantSubjects = listOf("student-1"))
        val studentSession = RecordingWebSocketSession()

        hub.register(studentSession, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        hub.subscribe(studentSession, activeLesson)

        assertTrue(studentSession.sentMessages.none { payload ->
            objectMapper.readTree(payload)["type"].asText() == "lesson.presence"
        })
    }

    private fun assertPresence(session: RecordingWebSocketSession, expectedState: String) {
        val message = session.sentMessages
            .map(objectMapper::readTree)
            .last { payload -> payload["type"].asText() == "lesson.presence" }
        assertEquals("student-1", message["participants"][0]["subject"].asText())
        assertEquals(expectedState, message["participants"][0]["state"].asText())
    }

    private fun lesson(
        id: UUID,
        status: String,
        participantSubjects: List<String>,
    ): ScheduledLessonResponse =
        ScheduledLessonResponse(
            id = id,
            lessonTemplateId = null,
            materialId = null,
            inheritTemplateMaterial = false,
            materialTitle = null,
            courseId = null,
            courseTitle = null,
            lessonTitle = "Realtime completion",
            teacherSubject = "teacher-1",
            teacherName = "Teacher Demo",
            scheduledStart = Instant.parse("2026-05-25T10:00:00Z"),
            scheduledEnd = Instant.parse("2026-05-25T10:45:00Z"),
            status = status,
            type = "GROUP",
            livekitRoomName = null,
            participants = participantSubjects.map { subject ->
                ScheduledLessonParticipantResponse(
                    subject = subject,
                    username = subject,
                    displayName = subject,
                    attendanceStatus = "PLANNED",
                )
            },
            createdAt = Instant.parse("2026-05-25T09:00:00Z"),
            updatedAt = Instant.parse("2026-05-25T09:00:00Z"),
        )
}

private class RecordingWebSocketSession : WebSocketSession {
    val sentMessages = mutableListOf<String>()
    private val sessionId = UUID.randomUUID().toString()
    private var open = true

    override fun getId(): String = sessionId

    override fun getUri(): URI? = URI.create("ws://localhost/api/ws/lessons")

    override fun getHandshakeHeaders(): HttpHeaders = HttpHeaders.EMPTY

    override fun getAttributes(): MutableMap<String, Any> = mutableMapOf()

    override fun getPrincipal(): Principal? = null

    override fun getLocalAddress(): InetSocketAddress? = null

    override fun getRemoteAddress(): InetSocketAddress? = null

    override fun getAcceptedProtocol(): String? = null

    override fun setTextMessageSizeLimit(messageSizeLimit: Int) = Unit

    override fun getTextMessageSizeLimit(): Int = 64 * 1024

    override fun setBinaryMessageSizeLimit(messageSizeLimit: Int) = Unit

    override fun getBinaryMessageSizeLimit(): Int = 64 * 1024

    override fun getExtensions(): MutableList<WebSocketExtension> = mutableListOf()

    override fun sendMessage(message: WebSocketMessage<*>) {
        sentMessages += (message as TextMessage).payload
    }

    override fun isOpen(): Boolean = open

    override fun close() {
        open = false
    }

    override fun close(status: CloseStatus) {
        open = false
    }
}
