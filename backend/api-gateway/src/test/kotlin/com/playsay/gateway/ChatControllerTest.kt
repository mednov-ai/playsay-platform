package com.playsay.gateway

import com.playsay.gateway.controller.ChatController
import com.playsay.gateway.dto.ChatMessageRequest
import com.playsay.gateway.dto.CreateChatConversationRequest
import com.playsay.gateway.dto.MarkChatReadRequest
import com.playsay.gateway.dto.ChatPushSubscriptionRequest
import com.playsay.gateway.dto.ChatPushUnsubscribeRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.ChatMessageEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.realtime.ChatRealtimeHub
import com.playsay.gateway.realtime.ChatRecordingSession
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.ChatConversationRepo
import com.playsay.gateway.repo.ChatEmailDigestMessageRepo
import com.playsay.gateway.repo.ChatEmailDigestRepo
import com.playsay.gateway.repo.ChatMessageRepo
import com.playsay.gateway.repo.ChatParticipantStateRepo
import com.playsay.gateway.client.ChatEmailClient
import com.playsay.gateway.client.ChatEmailCommand
import com.playsay.gateway.client.ChatWebPushClient
import com.playsay.gateway.client.ChatWebPushCommand
import com.playsay.gateway.client.ChatWebPushResult
import com.playsay.gateway.service.ChatEmailDigestScheduler
import com.playsay.gateway.service.ChatPushDeliveryService
import com.playsay.gateway.service.ChatPushDeliveryWorker
import com.playsay.gateway.repo.ChatPushDeliveryRepo
import com.playsay.gateway.repo.ChatPushSubscriptionRepo
import java.util.Base64
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.time.Clock
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.context.annotation.Import
import org.springframework.http.HttpStatus
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:chat-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=false",
        "playsay.chat-push.enabled=true",
        "playsay.chat-push.public-key=test-public-key",
        "playsay.chat-push.private-key=test-private-key",
        "playsay.chat-push.subject=mailto:test@honey.school",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Import(ChatControllerTest.ChatEmailTestConfiguration::class)
class ChatControllerTest @Autowired constructor(
    private val controller: ChatController,
    private val users: AppUserRepo,
    private val conversations: ChatConversationRepo,
    private val messages: ChatMessageRepo,
    private val states: ChatParticipantStateRepo,
    private val digests: ChatEmailDigestRepo,
    private val digestMessages: ChatEmailDigestMessageRepo,
    private val digestScheduler: ChatEmailDigestScheduler,
    private val pushSubscriptions: ChatPushSubscriptionRepo,
    private val pushDeliveries: ChatPushDeliveryRepo,
    private val pushWorker: ChatPushDeliveryWorker,
    private val realtimeHub: ChatRealtimeHub,
    private val dataSource: DataSource,
    private val transactionManager: PlatformTransactionManager,
) {
    @TestConfiguration
    class ChatEmailTestConfiguration {
        @Bean
        @Primary
        fun chatClock(): Clock = ChatTestClock

        @Bean
        @Primary
        fun chatEmailClient(): ChatEmailClient = RecordingChatEmailClient

        @Bean
        @Primary
        fun chatWebPushClient(): ChatWebPushClient = RecordingChatWebPushClient
    }

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@ChatControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        ChatTestClock.current = null
        RecordingChatEmailClient.sent.clear()
        RecordingChatEmailClient.failuresRemaining = 0
        RecordingChatWebPushClient.commands.clear()
        RecordingChatWebPushClient.result = ChatWebPushResult.Success
        pushDeliveries.deleteAllInBatch()
        pushSubscriptions.deleteAllInBatch()
        digestMessages.deleteAllInBatch()
        digests.deleteAllInBatch()
        states.deleteAllInBatch()
        messages.deleteAllInBatch()
        conversations.deleteAllInBatch()
        users.deleteAllInBatch()
    }

    @Test
    fun `teacher and student keep one persistent private conversation with unread receipt`() {
        val teacher = user("teacher", "TEACHER")
        val student = user("student", "STUDENT", teacher)
        val teacherAuth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val studentAuth = authentication(student.keycloakSubject, "ROLE_STUDENT")

        assertEquals(listOf(student.keycloakSubject), controller.contacts(teacherAuth).map { it.subject })
        assertEquals(listOf(teacher.keycloakSubject), controller.contacts(studentAuth).map { it.subject })

        val first = controller.createConversation(
            teacherAuth,
            CreateChatConversationRequest(student.keycloakSubject),
        )
        val repeated = controller.createConversation(
            studentAuth,
            CreateChatConversationRequest(teacher.keycloakSubject),
        )
        assertEquals(first.id, repeated.id)

        val clientMessageId = UUID.randomUUID()
        val sent = controller.sendMessage(
            teacherAuth,
            first.id,
            ChatMessageRequest(clientMessageId, "  Hello!  "),
        )
        val retried = controller.sendMessage(
            teacherAuth,
            first.id,
            ChatMessageRequest(clientMessageId, "Hello!"),
        )
        assertEquals(sent.id, retried.id)
        assertEquals("Hello!", sent.text)
        assertEquals(1, controller.conversations(studentAuth).single().unreadCount)
        assertEquals(1, controller.conversations(studentAuth).single().unreadVersion)

        val page = controller.messages(studentAuth, first.id, null, 50)
        assertEquals(listOf(sent.id), page.items.map { it.id })
        val receipt = controller.markRead(studentAuth, first.id, MarkChatReadRequest(sent.id))
        assertEquals(sent.id, receipt.lastReadMessageId)
        assertEquals(0, receipt.unreadCount)
        assertEquals(2, receipt.unreadVersion)
        assertEquals(0, controller.conversations(studentAuth).single().unreadCount)
        assertNotNull(controller.messages(teacherAuth, first.id, null, 50).items.single().readAt)
    }

    @Test
    fun `read marker keeps a later same timestamp message unread`() {
        val teacher = user("teacher-same-time", "TEACHER")
        val student = user("student-same-time", "STUDENT", teacher)
        val teacherAuth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val studentAuth = authentication(student.keycloakSubject, "ROLE_STUDENT")
        val conversation = controller.createConversation(
            teacherAuth,
            CreateChatConversationRequest(student.keycloakSubject),
        )
        val createdAt = Instant.parse("2026-08-26T05:00:00Z")
        val first = messages.saveAndFlush(
            ChatMessageEntity(
                id = UUID.fromString("00000000-0000-4000-8000-000000000001"),
                conversationId = conversation.id,
                senderUserId = teacher.id,
                clientMessageId = UUID.randomUUID(),
                body = "First",
                createdAt = createdAt,
            ),
        )
        messages.saveAndFlush(
            ChatMessageEntity(
                id = UUID.fromString("00000000-0000-4000-8000-000000000002"),
                conversationId = conversation.id,
                senderUserId = teacher.id,
                clientMessageId = UUID.randomUUID(),
                body = "Second",
                createdAt = createdAt,
            ),
        )

        val receipt = controller.markRead(studentAuth, conversation.id, MarkChatReadRequest(first.id))

        assertEquals(1, receipt.unreadCount)
        assertEquals(1, controller.conversations(studentAuth).single().unreadCount)
    }

    @Test
    fun `browser push subscription is private durable and contains no message text`() {
        val teacher = user("teacher-push", "TEACHER")
        val student = user("student-push", "STUDENT", teacher)
        val teacherAuth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val studentAuth = authentication(student.keycloakSubject, "ROLE_STUDENT")
        val endpoint = "https://push.example.test/subscription-1"

        assertTrue(controller.pushCapability(studentAuth).available)
        assertTrue(controller.upsertPushSubscription(studentAuth, pushRequest(endpoint)).enabled)
        val conversation = controller.createConversation(
            teacherAuth,
            CreateChatConversationRequest(student.keycloakSubject),
        )
        controller.sendMessage(
            teacherAuth,
            conversation.id,
            ChatMessageRequest(UUID.randomUUID(), "secret lesson message"),
        )

        assertEquals(ChatPushDeliveryService.STATUS_PENDING, pushDeliveries.findAll().single().status)
        pushWorker.dispatchDue()

        val command = RecordingChatWebPushClient.commands.single()
        assertTrue(command.payload.contains(conversation.id.toString()))
        assertTrue(!command.payload.contains("secret lesson message"))
        assertTrue(!command.payload.contains(teacher.keycloakSubject))
        assertEquals(ChatPushDeliveryService.STATUS_SENT, pushDeliveries.findAll().single().status)
        assertTrue(messages.findAll().single().deliveredAt == null)
    }

    @Test
    fun `push worker skips a message read before dispatch`() {
        val teacher = user("teacher-push-read", "TEACHER")
        val student = user("student-push-read", "STUDENT", teacher)
        val teacherAuth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val studentAuth = authentication(student.keycloakSubject, "ROLE_STUDENT")
        controller.upsertPushSubscription(studentAuth, pushRequest("https://push.example.test/read"))
        val conversation = controller.createConversation(
            teacherAuth,
            CreateChatConversationRequest(student.keycloakSubject),
        )
        val sent = controller.sendMessage(
            teacherAuth,
            conversation.id,
            ChatMessageRequest(UUID.randomUUID(), "Read first"),
        )
        controller.markRead(studentAuth, conversation.id, MarkChatReadRequest(sent.id))

        pushWorker.dispatchDue()

        assertTrue(RecordingChatWebPushClient.commands.isEmpty())
        assertEquals(ChatPushDeliveryService.STATUS_SKIPPED, pushDeliveries.findAll().single().status)
    }

    @Test
    fun `invalid push subscription is deactivated and cannot be removed by another user`() {
        val teacher = user("teacher-push-invalid", "TEACHER")
        val student = user("student-push-invalid", "STUDENT", teacher)
        val teacherAuth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val studentAuth = authentication(student.keycloakSubject, "ROLE_STUDENT")
        val endpoint = "https://push.example.test/invalid"
        controller.upsertPushSubscription(studentAuth, pushRequest(endpoint))

        controller.removePushSubscription(teacherAuth, ChatPushUnsubscribeRequest(endpoint))
        assertEquals(1, pushSubscriptions.count())

        val conversation = controller.createConversation(
            teacherAuth,
            CreateChatConversationRequest(student.keycloakSubject),
        )
        RecordingChatWebPushClient.result = ChatWebPushResult.PermanentFailure(410)
        controller.sendMessage(
            teacherAuth,
            conversation.id,
            ChatMessageRequest(UUID.randomUUID(), "Invalidate endpoint"),
        )
        pushWorker.dispatchDue()

        assertTrue(!pushSubscriptions.findAll().single().active)
        assertEquals(ChatPushDeliveryService.STATUS_INVALID, pushDeliveries.findAll().single().status)
    }

    private fun pushRequest(endpoint: String) = ChatPushSubscriptionRequest(
        endpoint = endpoint,
        p256dh = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(65) { 1 }),
        auth = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(16) { 2 }),
        locale = "en",
    )

    @Test
    fun `existing conversation remains active after teaching relationship ends`() {
        val teacher = user("teacher", "TEACHER")
        val student = user("student", "STUDENT", teacher)
        val teacherAuth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val studentAuth = authentication(student.keycloakSubject, "ROLE_STUDENT")
        val conversation = controller.createConversation(
            teacherAuth,
            CreateChatConversationRequest(student.keycloakSubject),
        )

        student.managedByTeacher = false
        student.managedByTeacherUserId = null
        users.saveAndFlush(student)

        assertTrue(controller.contacts(teacherAuth).isEmpty())
        assertEquals(
            "Still connected",
            controller.sendMessage(
                studentAuth,
                conversation.id,
                ChatMessageRequest(UUID.randomUUID(), "Still connected"),
            ).text,
        )
    }

    @Test
    fun `message history uses a stable cursor without duplicates`() {
        val teacher = user("teacher", "TEACHER")
        val student = user("student", "STUDENT", teacher)
        val teacherAuth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val conversation = controller.createConversation(
            teacherAuth,
            CreateChatConversationRequest(student.keycloakSubject),
        )
        repeat(3) { index ->
            controller.sendMessage(
                teacherAuth,
                conversation.id,
                ChatMessageRequest(UUID.randomUUID(), "Message ${index + 1}"),
            )
        }

        val latest = controller.messages(teacherAuth, conversation.id, null, 2)
        val earlier = controller.messages(teacherAuth, conversation.id, latest.nextCursor, 2)

        assertNotNull(latest.nextCursor)
        assertEquals(listOf("Message 2", "Message 3"), latest.items.map { it.text })
        assertEquals(listOf("Message 1"), earlier.items.map { it.text })
        assertEquals(3, (latest.items + earlier.items).map { it.id }.distinct().size)
    }

    @Test
    fun `unrelated teacher and admin cannot access private chat`() {
        val teacher = user("teacher", "TEACHER")
        val unrelated = user("unrelated", "TEACHER")
        val student = user("student", "STUDENT", teacher)
        val admin = user("admin", "ADMIN")
        val conversation = controller.createConversation(
            authentication(teacher.keycloakSubject, "ROLE_TEACHER"),
            CreateChatConversationRequest(student.keycloakSubject),
        )

        val unrelatedError = assertFailsWith<ProjectResponseException> {
            controller.messages(authentication(unrelated.keycloakSubject, "ROLE_TEACHER"), conversation.id, null, 50)
        }
        val adminError = assertFailsWith<ProjectResponseException> {
            controller.conversations(authentication(admin.keycloakSubject, "ROLE_ADMIN"))
        }

        assertEquals(HttpStatus.FORBIDDEN, unrelatedError.statusCode)
        assertEquals(MetaData.ErrorCodes.CHAT_ACCESS_DENIED, unrelatedError.errorCode)
        assertEquals(HttpStatus.FORBIDDEN, adminError.statusCode)
        assertEquals(MetaData.ErrorCodes.CHAT_ROLE_REQUIRED, adminError.errorCode)
    }

    @Test
    fun `online recipient receives delivery receipt and keeps email eligibility`() {
        val teacher = user("teacher-online", "TEACHER")
        val student = user("student-online", "STUDENT", teacher)
        val teacherSession = ChatRecordingSession()
        val studentSession = ChatRecordingSession()
        realtimeHub.register(teacherSession, teacher.keycloakSubject)
        realtimeHub.register(studentSession, student.keycloakSubject)
        try {
            val conversation = controller.createConversation(
                authentication(teacher.keycloakSubject, "ROLE_TEACHER"),
                CreateChatConversationRequest(student.keycloakSubject),
            )
            val sent = controller.sendMessage(
                authentication(teacher.keycloakSubject, "ROLE_TEACHER"),
                conversation.id,
                ChatMessageRequest(UUID.randomUUID(), "Delivered online"),
            )

            assertNotNull(controller.messages(
                authentication(teacher.keycloakSubject, "ROLE_TEACHER"),
                conversation.id,
                null,
                50,
            ).items.single { it.id == sent.id }.deliveredAt)
            assertTrue(teacherSession.sentMessages.any { it.contains("chat.messages.delivered") })
            assertEquals(1, digests.findAll().size)
        } finally {
            realtimeHub.unregister(teacherSession)
            realtimeHub.unregister(studentSession)
        }
    }

    @Test
    fun `offline messages are aggregated and repeated only after cooldown`() {
        val teacher = user("teacher-email", "TEACHER")
        val student = user("student-email", "STUDENT", teacher).apply {
            email = "student-email@example.com"
            locale = "en"
        }.let(users::saveAndFlush)
        val teacherAuth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val conversation = controller.createConversation(
            teacherAuth,
            CreateChatConversationRequest(student.keycloakSubject),
        )
        repeat(2) { index ->
            controller.sendMessage(
                teacherAuth,
                conversation.id,
                ChatMessageRequest(UUID.randomUUID(), "Offline ${index + 1}"),
            )
        }

        val firstDigest = digests.findAll().single()
        assertEquals(2, digestMessages.findByDigestIdOrderByCreatedAtAsc(firstDigest.id).size)
        digestScheduler.dispatchDueDigests(firstDigest.dueAt.plusSeconds(1))

        val firstEmail = RecordingChatEmailClient.sent.single()
        assertEquals("2", firstEmail.model["messageCount"])
        assertEquals("teacher-email", firstEmail.model["senderNames"])
        assertEquals("https://online.honey.school/?chat=${conversation.id}", firstEmail.model["chatUrl"])
        assertTrue(firstEmail.model.values.none { value -> value?.contains("Offline") == true })

        controller.sendMessage(
            teacherAuth,
            conversation.id,
            ChatMessageRequest(UUID.randomUUID(), "After first digest"),
        )
        val secondDigest = digests.findAll().single { it.id != firstDigest.id }
        val firstSentAt = digests.findById(firstDigest.id).orElseThrow().sentAt!!
        assertTrue(!secondDigest.dueAt.isBefore(firstSentAt.plusSeconds(1800)))
        digestScheduler.dispatchDueDigests(secondDigest.dueAt.minusSeconds(1))
        assertEquals(1, RecordingChatEmailClient.sent.size)
        digestScheduler.dispatchDueDigests(secondDigest.dueAt.plusSeconds(1))
        assertEquals(2, RecordingChatEmailClient.sent.size)
    }

    @Test
    fun `pending unread digest is sent even when recipient returns online`() {
        val teacher = user("teacher-return", "TEACHER")
        val student = user("student-return", "STUDENT", teacher).apply {
            email = "student-return@example.com"
        }.let(users::saveAndFlush)
        val conversation = controller.createConversation(
            authentication(teacher.keycloakSubject, "ROLE_TEACHER"),
            CreateChatConversationRequest(student.keycloakSubject),
        )
        controller.sendMessage(
            authentication(teacher.keycloakSubject, "ROLE_TEACHER"),
            conversation.id,
            ChatMessageRequest(UUID.randomUUID(), "See you online"),
        )
        val digest = digests.findAll().single()
        val studentSession = ChatRecordingSession()
        realtimeHub.register(studentSession, student.keycloakSubject)
        try {
            digestScheduler.dispatchDueDigests(digest.dueAt.plusSeconds(1))
            assertEquals(1, RecordingChatEmailClient.sent.size)
            assertEquals("SENT", digests.findById(digest.id).orElseThrow().status)
        } finally {
            realtimeHub.unregister(studentSession)
        }
    }

    @Test
    fun `failed digest is retried without creating another batch`() {
        val teacher = user("teacher-retry", "TEACHER")
        val student = user("student-retry", "STUDENT", teacher).apply {
            email = "student-retry@example.com"
        }.let(users::saveAndFlush)
        val conversation = controller.createConversation(
            authentication(teacher.keycloakSubject, "ROLE_TEACHER"),
            CreateChatConversationRequest(student.keycloakSubject),
        )
        controller.sendMessage(
            authentication(teacher.keycloakSubject, "ROLE_TEACHER"),
            conversation.id,
            ChatMessageRequest(UUID.randomUUID(), "Retry digest"),
        )
        val digest = digests.findAll().single()
        RecordingChatEmailClient.failuresRemaining = 1

        digestScheduler.dispatchDueDigests(digest.dueAt.plusSeconds(1))
        val retry = digests.findById(digest.id).orElseThrow()
        assertEquals("PENDING", retry.status)
        assertEquals(1, retry.attempts)
        assertTrue(RecordingChatEmailClient.sent.isEmpty())

        digestScheduler.dispatchDueDigests(retry.dueAt.plusSeconds(1))
        val sent = digests.findById(digest.id).orElseThrow()
        assertEquals("SENT", sent.status)
        assertEquals(2, sent.attempts)
        assertEquals(1, RecordingChatEmailClient.sent.size)
    }

    @Test
    fun `admin teacher retains private teacher chat without administrative override`() {
        val teacher = user("mixed-teacher", "ADMIN,TEACHER")
        val student = user("mixed-student", "STUDENT", teacher)
        val foreign = user("foreign-student", "STUDENT")
        val auth = authentication(teacher.keycloakSubject, "ROLE_ADMIN", "ROLE_TEACHER")
        val studentAuth = authentication(student.keycloakSubject, "ROLE_STUDENT")
        assertEquals(listOf(student.username), controller.contacts(auth).map { it.username })
        assertTrue(controller.pushCapability(auth).available)
        assertFailsWith<ProjectResponseException> {
            controller.createConversation(auth, CreateChatConversationRequest(foreign.keycloakSubject))
        }
        val conversation = controller.createConversation(studentAuth, CreateChatConversationRequest(teacher.keycloakSubject))
        val incoming = controller.sendMessage(studentAuth, conversation.id, ChatMessageRequest(UUID.randomUUID(), "Mixed role test"))
        assertEquals(1, controller.conversations(auth).single().unreadCount)
        assertEquals(incoming.id, controller.messages(auth, conversation.id, null, 50).items.single().id)
        controller.markRead(auth, conversation.id, MarkChatReadRequest(incoming.id))
        assertEquals(0, controller.conversations(auth).single().unreadCount)
        controller.sendMessage(auth, conversation.id, ChatMessageRequest(UUID.randomUUID(), "Reply"))
        assertEquals(2, controller.messages(studentAuth, conversation.id, null, 50).items.size)
    }

    @Test
    fun `reading batch suppresses email and no new messages means no repeat`() {
        val teacher = user("read-teacher", "TEACHER")
        val student = user("read-student", "STUDENT", teacher).apply {
            email = "read-student@example.com"
        }.let(users::saveAndFlush)
        val auth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val conversation = controller.createConversation(auth, CreateChatConversationRequest(student.keycloakSubject))
        val request = ChatMessageRequest(UUID.randomUUID(), "Read before email")
        val sent = controller.sendMessage(auth, conversation.id, request)
        controller.sendMessage(auth, conversation.id, request)
        assertEquals(1, digestMessages.count())
        val digest = digests.findAll().single()
        assertTrue(digest.dueAt >= digest.createdAt.plusSeconds(120))
        controller.markRead(authentication(student.keycloakSubject, "ROLE_STUDENT"), conversation.id, MarkChatReadRequest(sent.id))
        digestScheduler.dispatchDueDigests(digest.dueAt.plusSeconds(1))
        digestScheduler.dispatchDueDigests(digest.dueAt.plusSeconds(7200))
        assertEquals("SKIPPED", digests.findById(digest.id).orElseThrow().status)
        assertTrue(RecordingChatEmailClient.sent.isEmpty())
        assertEquals(1, digests.count())
    }

    @Test
    fun `email uses exact two minute grace and minute 29 arrival waits until minute 31`() {
        val start = Instant.parse("2026-09-03T10:00:00Z")
        ChatTestClock.current = start
        val teacher = user("clock-teacher", "TEACHER")
        val student = user("clock-student", "STUDENT", teacher).apply {
            email = "clock-student@example.com"
        }.let(users::saveAndFlush)
        val auth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val conversation = controller.createConversation(auth, CreateChatConversationRequest(student.keycloakSubject))
        controller.sendMessage(auth, conversation.id, ChatMessageRequest(UUID.randomUUID(), "First"))
        val first = digests.findAll().single()
        assertEquals(start.plusSeconds(120), first.dueAt)
        digestScheduler.dispatchDueDigests(start.plusSeconds(119))
        assertTrue(RecordingChatEmailClient.sent.isEmpty())
        ChatTestClock.current = first.dueAt
        digestScheduler.dispatchDueDigests(first.dueAt)
        assertEquals(1, RecordingChatEmailClient.sent.size)
        ChatTestClock.current = first.dueAt.plusSeconds(29 * 60)
        controller.sendMessage(auth, conversation.id, ChatMessageRequest(UUID.randomUUID(), "New"))
        val second = digests.findAll().single { it.id != first.id }
        assertEquals(first.dueAt.plusSeconds(31 * 60), second.dueAt)
        digestScheduler.dispatchDueDigests(second.dueAt.minusSeconds(1))
        assertEquals(1, RecordingChatEmailClient.sent.size)
        digestScheduler.dispatchDueDigests(second.dueAt)
        digestScheduler.dispatchDueDigests(second.dueAt.plusSeconds(7200))
        assertEquals(2, RecordingChatEmailClient.sent.size)
    }

    @Test
    fun `rollback discards message and both notification queues`() {
        val teacher = user("rollback-teacher", "TEACHER")
        val student = user("rollback-student", "STUDENT", teacher)
        val auth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val conversation = controller.createConversation(auth, CreateChatConversationRequest(student.keycloakSubject))
        TransactionTemplate(transactionManager).executeWithoutResult { transaction ->
            controller.sendMessage(auth, conversation.id, ChatMessageRequest(UUID.randomUUID(), "Rolled back"))
            transaction.setRollbackOnly()
        }
        assertEquals(0, messages.count())
        assertEquals(0, digests.count())
        assertEquals(0, digestMessages.count())
        assertEquals(0, pushDeliveries.count())
    }

    @Test
    fun `new messages do not join an attempted digest and retries keep the same idempotency key`() {
        val teacher = user("retry-new-teacher", "TEACHER")
        val student = user("retry-new-student", "STUDENT", teacher).apply {
            email = "retry-new-student@example.com"
        }.let(users::saveAndFlush)
        val auth = authentication(teacher.keycloakSubject, "ROLE_TEACHER")
        val conversation = controller.createConversation(auth, CreateChatConversationRequest(student.keycloakSubject))
        controller.sendMessage(auth, conversation.id, ChatMessageRequest(UUID.randomUUID(), "First"))
        val first = digests.findAll().single()
        RecordingChatEmailClient.failuresRemaining = 1
        digestScheduler.dispatchDueDigests(first.dueAt)
        controller.sendMessage(auth, conversation.id, ChatMessageRequest(UUID.randomUUID(), "After failure"))
        assertEquals(2, digests.count())
        assertEquals(1, digestMessages.findByDigestIdOrderByCreatedAtAsc(first.id).size)
        val retry = digests.findById(first.id).orElseThrow()
        assertEquals(first.idempotencyKey, retry.idempotencyKey)
        digestScheduler.dispatchDueDigests(retry.dueAt.plusSeconds(1))
        assertEquals(1, RecordingChatEmailClient.sent.size)
        val pending = digests.findAll().single { it.status == "PENDING" }
        val sentAt = digests.findAll().single { it.status == "SENT" }.sentAt!!
        assertTrue(pending.dueAt >= sentAt.plusSeconds(1800))
    }

    private fun user(subject: String, roles: String, primaryTeacher: AppUserEntity? = null): AppUserEntity {
        val now = Instant.now()
        return users.saveAndFlush(
            AppUserEntity(
                keycloakSubject = subject,
                username = subject,
                displayName = subject,
                roles = roles,
                managedByTeacher = primaryTeacher != null,
                managedByTeacherUserId = primaryTeacher?.id,
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    private fun authentication(subject: String, vararg roles: String): JwtAuthenticationToken {
        val issuedAt = Instant.now().minusSeconds(5)
        val jwt = Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject(subject)
            .claim("preferred_username", subject)
            .issuedAt(issuedAt)
            .expiresAt(issuedAt.plusSeconds(3_600))
            .build()
        return JwtAuthenticationToken(jwt, roles.map(::SimpleGrantedAuthority))
    }
}

private object ChatTestClock : Clock() {
    var current: Instant? = null
    override fun getZone(): ZoneId = ZoneOffset.UTC
    override fun withZone(zone: ZoneId): Clock = this
    override fun instant(): Instant = current ?: Instant.now()
}

private object RecordingChatEmailClient : ChatEmailClient {
    val sent = mutableListOf<ChatEmailCommand>()
    var failuresRemaining = 0

    override fun send(command: ChatEmailCommand) {
        if (failuresRemaining > 0) {
            failuresRemaining -= 1
            throw IllegalStateException("simulated chat email failure")
        }
        sent += command
    }
}

private object RecordingChatWebPushClient : ChatWebPushClient {
    val commands = mutableListOf<ChatWebPushCommand>()
    var result: ChatWebPushResult = ChatWebPushResult.Success

    override fun send(command: ChatWebPushCommand): ChatWebPushResult {
        commands += command
        return result
    }
}
