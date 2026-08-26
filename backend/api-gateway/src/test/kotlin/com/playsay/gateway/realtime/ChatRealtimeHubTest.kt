package com.playsay.gateway.realtime

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.ChatDeliveryReceiptResponse
import com.playsay.gateway.dto.ChatMessageResponse
import com.playsay.gateway.dto.ChatUnreadStateResponse
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

class ChatRealtimeHubTest {
    private val objectMapper = jacksonObjectMapper().findAndRegisterModules()

    @Test
    fun `message is delivered to every participant tab and nobody else`() {
        val hub = ChatRealtimeHub(objectMapper)
        val teacherOne = ChatRecordingSession()
        val teacherTwo = ChatRecordingSession()
        val student = ChatRecordingSession()
        val outsider = ChatRecordingSession()
        hub.register(teacherOne, "teacher")
        hub.register(teacherTwo, "teacher")
        hub.register(student, "student")
        hub.register(outsider, "outsider")

        val delivered = hub.publish(
            ChatMessageCreatedEvent(
                message = ChatMessageResponse(
                    id = UUID.randomUUID(),
                    conversationId = UUID.randomUUID(),
                    senderSubject = "teacher",
                    clientMessageId = UUID.randomUUID(),
                    text = "Hello",
                    createdAt = Instant.parse("2026-07-19T10:00:00Z"),
                ),
                senderSubject = "teacher",
                recipientSubject = "student",
                recipientUserId = UUID.randomUUID(),
            ),
        )

        assertTrue(delivered)
        listOf(teacherOne, teacherTwo, student).forEach { session ->
            val payload = objectMapper.readTree(session.sentMessages.last())
            assertEquals("chat.message.created", payload["type"].asText())
            assertEquals("Hello", payload["message"]["text"].asText())
        }
        assertTrue(outsider.sentMessages.none { objectMapper.readTree(it)["type"].asText() == "chat.message.created" })
    }

    @Test
    fun `delivery receipt is sent only to sender sessions`() {
        val hub = ChatRealtimeHub(objectMapper)
        val teacher = ChatRecordingSession()
        val student = ChatRecordingSession()
        hub.register(teacher, "teacher")
        hub.register(student, "student")
        val messageId = UUID.randomUUID()

        hub.publish(
            ChatMessagesDeliveredEvent(
                receipt = ChatDeliveryReceiptResponse(
                    conversationId = UUID.randomUUID(),
                    recipientSubject = "student",
                    messageIds = listOf(messageId),
                    deliveredAt = Instant.parse("2026-07-19T10:01:00Z"),
                ),
                senderSubjects = setOf("teacher"),
            ),
        )

        val payload = objectMapper.readTree(teacher.sentMessages.last())
        assertEquals("chat.messages.delivered", payload["type"].asText())
        assertEquals(messageId.toString(), payload["delivery"]["messageIds"][0].asText())
        assertTrue(student.sentMessages.none { objectMapper.readTree(it)["type"].asText() == "chat.messages.delivered" })
    }

    @Test
    fun `unread state is sent only to recipient sessions`() {
        val hub = ChatRealtimeHub(objectMapper)
        val teacher = ChatRecordingSession()
        val student = ChatRecordingSession()
        hub.register(teacher, "teacher")
        hub.register(student, "student")
        val conversationId = UUID.randomUUID()

        hub.publish(
            ChatUnreadChangedEvent(
                unread = ChatUnreadStateResponse(
                    conversationId = conversationId,
                    unreadCount = 3,
                    unreadVersion = 4,
                    causeMessageId = UUID.randomUUID(),
                ),
                recipientSubject = "student",
            ),
        )

        val payload = objectMapper.readTree(student.sentMessages.last())
        assertEquals("chat.unread.changed", payload["type"].asText())
        assertEquals(conversationId.toString(), payload["unread"]["conversationId"].asText())
        assertEquals(3, payload["unread"]["unreadCount"].asInt())
        assertEquals(4, payload["unread"]["unreadVersion"].asLong())
        assertTrue(teacher.sentMessages.none { objectMapper.readTree(it)["type"].asText() == "chat.unread.changed" })
    }
}

class ChatRecordingSession : WebSocketSession {
    val sentMessages = mutableListOf<String>()
    private val sessionId = UUID.randomUUID().toString()
    private var open = true

    override fun getId(): String = sessionId
    override fun getUri(): URI = URI.create("ws://localhost/api/ws/chat")
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
