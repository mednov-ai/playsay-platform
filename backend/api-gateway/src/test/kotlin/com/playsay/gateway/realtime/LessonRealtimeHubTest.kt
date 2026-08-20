package com.playsay.gateway.realtime

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.playsay.gateway.dto.ScheduledLessonParticipantResponse
import com.playsay.gateway.dto.ScheduledLessonResponse
import java.net.InetSocketAddress
import java.net.URI
import java.security.Principal
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.springframework.http.HttpHeaders
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketExtension
import org.springframework.web.socket.WebSocketMessage
import org.springframework.web.socket.WebSocketSession

class LessonRealtimeHubTest {
    private val objectMapper = jacksonObjectMapper()
        .findAndRegisterModules()
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

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

    @Test
    fun `assignment changes reach recipients and teachers but not unrelated students`() {
        val hub = LessonRealtimeHub(objectMapper)
        val assignmentId = UUID.randomUUID()
        val teacherSession = RecordingWebSocketSession()
        val recipientSession = RecordingWebSocketSession()
        val unrelatedSession = RecordingWebSocketSession()

        hub.register(teacherSession, LessonRealtimePrincipal(subject = "teacher-1", roles = setOf("TEACHER")))
        hub.register(recipientSession, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        hub.register(unrelatedSession, LessonRealtimePrincipal(subject = "student-2", roles = setOf("STUDENT")))

        hub.publishAssignmentChanged(
            assignmentId = assignmentId,
            visibleSubjects = setOf("teacher-1", "student-1"),
            change = "CREATED",
        )

        listOf(teacherSession, recipientSession).forEach { session ->
            val message = objectMapper.readTree(session.sentMessages.last())
            assertEquals("assignment.changed", message["type"].asText())
            assertEquals(assignmentId.toString(), message["assignmentId"].asText())
            assertEquals("CREATED", message["change"].asText())
        }
        assertTrue(unrelatedSession.sentMessages.isEmpty())
    }

    @Test
    fun `student dice roll is server generated and broadcast to every lesson subscriber`() {
        val hub = LessonRealtimeHub(objectMapper)
        val activeLesson = lesson(id = UUID.randomUUID(), status = "IN_PROGRESS", participantSubjects = listOf("student-1"))
        val teacherSession = RecordingWebSocketSession()
        val studentSession = RecordingWebSocketSession()
        val requestId = UUID.randomUUID()
        val rolledAt = Instant.parse("2026-05-25T10:10:00Z")

        hub.register(teacherSession, LessonRealtimePrincipal(subject = "teacher-1", roles = setOf("TEACHER")))
        hub.register(studentSession, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        hub.subscribe(teacherSession, activeLesson)
        hub.subscribe(studentSession, activeLesson)
        hub.rollDice(studentSession, activeLesson, requestId, rolledAt)

        listOf(teacherSession, studentSession).forEach { session ->
            val message = session.lastMessageOfType("tool.dice.rolled")
            assertEquals(activeLesson.id.toString(), message["lessonId"].asText())
            assertEquals(requestId.toString(), message["requestId"].asText())
            assertTrue(message["value"].asInt() in 1..6)
            assertEquals("student-1", message["rollerSubject"].asText())
            assertEquals("student-1", message["rollerName"].asText())
            assertEquals(rolledAt.toString(), message["rolledAt"].asText())
            assertEquals(rolledAt.plusMillis(DICE_COOLDOWN_MILLIS).toString(), message["cooldownUntil"].asText())
        }
    }

    @Test
    fun `lesson dice cooldown accepts only the first concurrent window roll`() {
        val hub = LessonRealtimeHub(objectMapper)
        val activeLesson = lesson(
            id = UUID.randomUUID(),
            status = "IN_PROGRESS",
            participantSubjects = listOf("student-1", "student-2"),
        )
        val firstStudent = RecordingWebSocketSession()
        val secondStudent = RecordingWebSocketSession()
        val rolledAt = Instant.parse("2026-05-25T10:10:00Z")

        hub.register(firstStudent, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        hub.register(secondStudent, LessonRealtimePrincipal(subject = "student-2", roles = setOf("STUDENT")))
        hub.subscribe(firstStudent, activeLesson)
        hub.subscribe(secondStudent, activeLesson)
        hub.rollDice(firstStudent, activeLesson, UUID.randomUUID(), rolledAt)
        hub.rollDice(secondStudent, activeLesson, UUID.randomUUID(), rolledAt.plusMillis(250))

        val rejection = secondStudent.lastMessageOfType("tool.dice.rejected")
        assertEquals(LessonDiceRejectionCodes.COOLDOWN, rejection["code"].asText())
        assertEquals(rolledAt.plusMillis(DICE_COOLDOWN_MILLIS).toString(), rejection["retryAt"].asText())
        assertEquals(1, secondStudent.messagesOfType("tool.dice.rolled").size)
    }

    @Test
    fun `dice snapshot restores the icon without replaying a roll`() {
        val hub = LessonRealtimeHub(objectMapper)
        val activeLesson = lesson(id = UUID.randomUUID(), status = "IN_PROGRESS", participantSubjects = listOf("student-1"))
        val teacherSession = RecordingWebSocketSession()
        val reconnectedStudent = RecordingWebSocketSession()

        hub.register(teacherSession, LessonRealtimePrincipal(subject = "teacher-1", roles = setOf("TEACHER")))
        hub.subscribe(teacherSession, activeLesson)
        hub.rollDice(teacherSession, activeLesson, UUID.randomUUID(), Instant.parse("2026-05-25T10:10:00Z"))

        hub.register(reconnectedStudent, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        hub.subscribe(reconnectedStudent, activeLesson)

        assertEquals(1, reconnectedStudent.messagesOfType("tool.dice.snapshot").size)
        assertTrue(reconnectedStudent.messagesOfType("tool.dice.rolled").isEmpty())
    }

    @Test
    fun `dice rejects non participants and inactive lessons`() {
        val hub = LessonRealtimeHub(objectMapper)
        val lessonId = UUID.randomUUID()
        val activeLesson = lesson(id = lessonId, status = "IN_PROGRESS", participantSubjects = listOf("student-1"))
        val outsider = RecordingWebSocketSession()
        val teacher = RecordingWebSocketSession()

        hub.register(outsider, LessonRealtimePrincipal(subject = "student-2", roles = setOf("STUDENT")))
        hub.subscribe(outsider, activeLesson)
        hub.rollDice(outsider, activeLesson, UUID.randomUUID())
        assertEquals(
            LessonDiceRejectionCodes.FORBIDDEN,
            outsider.lastMessageOfType("tool.dice.rejected")["code"].asText(),
        )

        val scheduledLesson = lesson(id = lessonId, status = "SCHEDULED", participantSubjects = listOf("student-1"))
        hub.register(teacher, LessonRealtimePrincipal(subject = "teacher-1", roles = setOf("TEACHER")))
        hub.subscribe(teacher, scheduledLesson)
        hub.rollDice(teacher, scheduledLesson, UUID.randomUUID())
        assertEquals(
            LessonDiceRejectionCodes.LESSON_NOT_ACTIVE,
            teacher.lastMessageOfType("tool.dice.rejected")["code"].asText(),
        )

        val outsideWindowLesson = lesson(
            id = UUID.randomUUID(),
            status = "IN_PROGRESS",
            participantSubjects = listOf("student-1"),
        )
        hub.subscribe(teacher, outsideWindowLesson)
        hub.rollDice(
            teacher,
            outsideWindowLesson,
            UUID.randomUUID(),
            Instant.parse("2026-05-25T12:00:01Z"),
        )
        assertEquals(
            LessonDiceRejectionCodes.LESSON_NOT_ACTIVE,
            teacher.lastMessageOfType("tool.dice.rejected")["code"].asText(),
        )
    }

    @Test
    fun `last dice result is cleared when the final lesson subscriber leaves`() {
        val hub = LessonRealtimeHub(objectMapper)
        val activeLesson = lesson(id = UUID.randomUUID(), status = "IN_PROGRESS", participantSubjects = listOf("student-1"))
        val teacher = RecordingWebSocketSession()
        val student = RecordingWebSocketSession()

        hub.register(teacher, LessonRealtimePrincipal(subject = "teacher-1", roles = setOf("TEACHER")))
        hub.subscribe(teacher, activeLesson)
        hub.rollDice(teacher, activeLesson, UUID.randomUUID(), Instant.parse("2026-05-25T10:10:00Z"))
        hub.unregister(teacher)

        hub.register(student, LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT")))
        hub.subscribe(student, activeLesson)

        assertFalse(student.sentMessages.any { objectMapper.readTree(it)["type"].asText() == "tool.dice.snapshot" })
    }

    private fun assertPresence(session: RecordingWebSocketSession, expectedState: String) {
        val message = session.sentMessages
            .map(objectMapper::readTree)
            .last { payload -> payload["type"].asText() == "lesson.presence" }
        assertEquals("student-1", message["participants"][0]["subject"].asText())
        assertEquals(expectedState, message["participants"][0]["state"].asText())
    }

    private fun RecordingWebSocketSession.messagesOfType(type: String) =
        sentMessages.map(objectMapper::readTree).filter { message -> message["type"].asText() == type }

    private fun RecordingWebSocketSession.lastMessageOfType(type: String) =
        messagesOfType(type).last()

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
