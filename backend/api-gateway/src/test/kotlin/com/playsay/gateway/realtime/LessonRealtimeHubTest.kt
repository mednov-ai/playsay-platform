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
        hub.subscribe(studentSession, lessonId)

        hub.publishLessonUpdated(lesson(id = lessonId, status = "COMPLETED", participantSubjects = listOf("student-1")))

        val lastMessage = objectMapper.readTree(studentSession.sentMessages.last())
        assertEquals("lesson.deleted", lastMessage["type"].asText())
        assertEquals(lessonId.toString(), lastMessage["lessonId"].asText())
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
