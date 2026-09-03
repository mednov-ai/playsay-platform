package com.playsay.gateway.service

import com.playsay.gateway.dto.ChatContactResponse
import com.playsay.gateway.dto.ChatConversationResponse
import com.playsay.gateway.dto.ChatMessagePageResponse
import com.playsay.gateway.dto.ChatMessageRequest
import com.playsay.gateway.dto.ChatMessageResponse
import com.playsay.gateway.dto.ChatReadReceiptResponse
import com.playsay.gateway.dto.ChatUnreadStateResponse
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.ChatConversationEntity
import com.playsay.gateway.entity.ChatMessageEntity
import com.playsay.gateway.entity.ChatParticipantStateEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.realtime.ChatConversationReadEvent
import com.playsay.gateway.realtime.ChatMessageCreatedEvent
import com.playsay.gateway.realtime.ChatUnreadChangedEvent
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.ChatConversationRepo
import com.playsay.gateway.repo.ChatMessageRepo
import com.playsay.gateway.repo.ChatParticipantStateRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.utils.hasApplicationRole
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.Instant
import java.util.Base64
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Suppress("LongParameterList")
class ChatService(
    private val appUserRepo: AppUserRepo,
    private val conversationRepo: ChatConversationRepo,
    private val messageRepo: ChatMessageRepo,
    private val participantStateRepo: ChatParticipantStateRepo,
    private val delegationRepo: TeacherDelegationRepo,
    private val studentAccessPolicy: StudentAccessPolicy,
    private val userProfileStore: UserProfileStore,
    private val chatPushDeliveryService: ChatPushDeliveryService,
    private val chatEmailDigestService: ChatEmailDigestService,
    private val eventPublisher: ApplicationEventPublisher,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun contacts(authentication: JwtAuthenticationToken): List<ChatContactResponse> {
        val actor = actor(authentication)
        return eligibleContacts(authentication, actor)
            .distinctBy(AppUserEntity::id)
            .sortedBy(::displayName)
            .map(::contact)
    }

    @Transactional(readOnly = true)
    fun conversations(authentication: JwtAuthenticationToken): List<ChatConversationResponse> {
        val actor = actor(authentication)
        return conversationRepo.findForUser(actor.id).map { conversation -> summary(conversation, actor) }
    }

    @Transactional
    fun createConversation(
        authentication: JwtAuthenticationToken,
        participantSubject: String,
    ): ChatConversationResponse {
        val actor = actor(authentication)
        val participant = appUserRepo.findByKeycloakSubject(participantSubject.trim())
            ?.takeIf { it.deletedAt == null }
            ?: fail(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.CHAT_CONTACT_NOT_FOUND)
        val (teacher, student) = conversationParticipants(authentication, actor, participant)
        appUserRepo.lockByIdIn(listOf(teacher.id, student.id).sorted())
        val existing = conversationRepo.findByTeacherUserIdAndStudentUserId(teacher.id, student.id)
        if (existing != null) return summary(existing, actor)

        val created = conversationRepo.saveAndFlush(
            ChatConversationEntity(
                id = UUID.randomUUID(),
                teacherUserId = teacher.id,
                studentUserId = student.id,
                createdAt = Instant.now(clock),
            ),
        )
        participantStateRepo.saveAllAndFlush(
            listOf(
                participantState(created.id, teacher.id, created.createdAt),
                participantState(created.id, student.id, created.createdAt),
            ),
        )
        return summary(created, actor)
    }

    @Transactional(readOnly = true)
    fun messages(
        authentication: JwtAuthenticationToken,
        conversationId: UUID,
        cursor: String?,
        requestedLimit: Int,
    ): ChatMessagePageResponse {
        val actor = actor(authentication)
        val conversation = conversation(conversationId, actor)
        val decodedCursor = cursor?.let(::decodeCursor)
        val limit = requestedLimit.coerceIn(1, 100)
        val pageable = PageRequest.of(0, limit + 1)
        val page = decodedCursor?.let { (beforeCreatedAt, beforeId) ->
            messageRepo.findPageBefore(
                conversationId = conversation.id,
                beforeCreatedAt = beforeCreatedAt,
                beforeId = beforeId,
                pageable = pageable,
            )
        } ?: messageRepo.findPage(
            conversationId = conversation.id,
            pageable = pageable,
        )
        val hasMore = page.size > limit
        val visible = page.take(limit)
        val states = states(conversation)
        return ChatMessagePageResponse(
            items = visible.asReversed().map { message -> message(message, conversation, states) },
            nextCursor = visible.lastOrNull()?.takeIf { hasMore }?.let(::encodeCursor),
        )
    }

    @Transactional
    fun sendMessage(
        authentication: JwtAuthenticationToken,
        conversationId: UUID,
        request: ChatMessageRequest,
    ): ChatMessageResponse {
        val actor = actor(authentication)
        val conversation = conversationForUpdate(conversationId, actor)
        messageRepo.findBySenderUserIdAndClientMessageId(actor.id, request.clientMessageId)?.let { existing ->
            if (existing.conversationId != conversation.id) {
                fail(HttpStatus.CONFLICT, MetaData.ErrorCodes.CHAT_ACCESS_DENIED)
            }
            return message(existing, conversation, states(conversation))
        }
        val text = request.text.trim()
        if (text.isEmpty()) fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.CHAT_MESSAGE_EMPTY)
        if (text.length > MAX_MESSAGE_LENGTH) fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.CHAT_MESSAGE_TOO_LONG)
        val counterpart = counterpart(conversation, actor)
        if (counterpart.deletedAt != null) fail(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.CHAT_CONTACT_NOT_FOUND)

        val now = Instant.now(clock)
        val saved = messageRepo.saveAndFlush(
            ChatMessageEntity(
                id = UUID.randomUUID(),
                conversationId = conversation.id,
                senderUserId = actor.id,
                clientMessageId = request.clientMessageId,
                body = text,
                createdAt = now,
            ),
        )
        conversation.lastMessageAt = now
        conversationRepo.save(conversation)
        val recipientState = participantStateRepo.lockByConversationIdAndUserId(conversation.id, counterpart.id)
            ?: participantState(conversation.id, counterpart.id, now)
        recipientState.unreadVersion += 1
        recipientState.updatedAt = now
        participantStateRepo.saveAndFlush(recipientState)
        val response = message(saved, conversation, states(conversation))
        val unread = ChatUnreadStateResponse(
            conversationId = conversation.id,
            unreadCount = unreadCount(conversation.id, counterpart.id, recipientState),
            unreadVersion = recipientState.unreadVersion,
            causeMessageId = saved.id,
        )
        chatPushDeliveryService.enqueue(saved, counterpart.id)
        chatEmailDigestService.enqueue(counterpart.id, saved.id)
        eventPublisher.publishEvent(
            ChatMessageCreatedEvent(
                message = response,
                senderSubject = actor.keycloakSubject,
                recipientSubject = counterpart.keycloakSubject,
                recipientUserId = counterpart.id,
            ),
        )
        eventPublisher.publishEvent(ChatUnreadChangedEvent(unread, counterpart.keycloakSubject))
        return response
    }

    @Transactional
    fun markRead(
        authentication: JwtAuthenticationToken,
        conversationId: UUID,
        lastReadMessageId: UUID,
    ): ChatReadReceiptResponse {
        val actor = actor(authentication)
        val conversation = conversationForUpdate(conversationId, actor)
        val target = messageRepo.findById(lastReadMessageId).orElse(null)
            ?.takeIf { it.conversationId == conversation.id }
            ?: fail(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.CHAT_MESSAGE_NOT_FOUND)
        val now = Instant.now(clock)
        val state = participantStateRepo.lockByConversationIdAndUserId(conversation.id, actor.id)
            ?: participantState(conversation.id, actor.id, now)
        if (isAfterReadMarker(target, state)) {
            state.lastReadMessageId = target.id
            state.readAt = target.createdAt
            state.unreadVersion += 1
            state.updatedAt = now
            participantStateRepo.saveAndFlush(state)
        }
        val deliveredAt = Instant.now(clock)
        val newlyDelivered = messageRepo.findPendingDelivery(actor.id)
            .filter { message -> message.conversationId == conversation.id && message.createdAt <= target.createdAt }
            .onEach { message -> message.deliveredAt = deliveredAt }
        if (newlyDelivered.isNotEmpty()) messageRepo.saveAll(newlyDelivered)
        val receipt = ChatReadReceiptResponse(
            conversationId = conversation.id,
            readerSubject = actor.keycloakSubject,
            lastReadMessageId = state.lastReadMessageId ?: target.id,
            readAt = state.readAt ?: target.createdAt,
            unreadCount = unreadCount(conversation.id, actor.id, state),
            unreadVersion = state.unreadVersion,
        )
        eventPublisher.publishEvent(
            ChatConversationReadEvent(receipt, participantSubjects(conversation)),
        )
        return receipt
    }

    private fun actor(authentication: JwtAuthenticationToken): AppUserEntity {
        ChatAccessPolicy.requireAccess(authentication)
        return appUserRepo.findById(userProfileStore.currentUserId(authentication)).orElseThrow()
    }

    private fun eligibleContacts(authentication: JwtAuthenticationToken, actor: AppUserEntity): List<AppUserEntity> =
        if (authentication.authorities.any { it.authority == MetaData.Authorities.TEACHER }) {
            val primary = appUserRepo.findByManagedByTeacherUserIdOrderByDisplayNameAscUsernameAsc(actor.id)
            val delegated = appUserRepo.findByIdIn(delegationRepo.findActiveStudentIds(actor.id, Instant.now(clock)))
            (primary + delegated).filter { it.deletedAt == null && it.roles.hasApplicationRole(MetaData.Roles.STUDENT) }
        } else {
            val teacherIds = buildSet {
                actor.managedByTeacherUserId?.let(::add)
                delegationRepo.findActiveForStudent(actor.id, Instant.now(clock)).mapTo(this) { it.delegateTeacherUserId }
            }
            if (teacherIds.isEmpty()) emptyList() else appUserRepo.findByIdIn(teacherIds)
                .filter { it.deletedAt == null && it.roles.hasApplicationRole(MetaData.Roles.TEACHER) }
        }

    private fun conversationParticipants(
        authentication: JwtAuthenticationToken,
        actor: AppUserEntity,
        participant: AppUserEntity,
    ): Pair<AppUserEntity, AppUserEntity> =
        if (authentication.authorities.any { it.authority == MetaData.Authorities.TEACHER }) {
            if (!participant.roles.hasApplicationRole(MetaData.Roles.STUDENT) ||
                studentAccessPolicy.evaluate(actor.id, participant.id) == StudentAccessDecision.DENIED
            ) {
                fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.CHAT_CONTACT_NOT_FOUND)
            }
            actor to participant
        } else {
            if (!participant.roles.hasApplicationRole(MetaData.Roles.TEACHER) ||
                eligibleContacts(authentication, actor).none { it.id == participant.id }
            ) {
                fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.CHAT_CONTACT_NOT_FOUND)
            }
            participant to actor
        }

    private fun conversation(id: UUID, actor: AppUserEntity): ChatConversationEntity {
        val conversation = conversationRepo.findById(id).orElse(null)
            ?: fail(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.CHAT_CONVERSATION_NOT_FOUND)
        if (actor.id != conversation.teacherUserId && actor.id != conversation.studentUserId) {
            fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.CHAT_ACCESS_DENIED)
        }
        return conversation
    }

    private fun conversationForUpdate(id: UUID, actor: AppUserEntity): ChatConversationEntity {
        val conversation = conversationRepo.lockById(id)
            ?: fail(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.CHAT_CONVERSATION_NOT_FOUND)
        if (actor.id != conversation.teacherUserId && actor.id != conversation.studentUserId) {
            fail(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.CHAT_ACCESS_DENIED)
        }
        return conversation
    }

    private fun summary(conversation: ChatConversationEntity, actor: AppUserEntity): ChatConversationResponse {
        val states = states(conversation)
        val latest = messageRepo.findFirstByConversationIdOrderByCreatedAtDescIdDesc(conversation.id)
        val actorState = states[actor.id]
        return ChatConversationResponse(
            id = conversation.id,
            counterpart = contact(counterpart(conversation, actor)),
            lastMessage = latest?.let { message(it, conversation, states) },
            unreadCount = unreadCount(conversation.id, actor.id, actorState),
            unreadVersion = actorState?.unreadVersion ?: 0,
            createdAt = conversation.createdAt,
        )
    }

    private fun unreadCount(
        conversationId: UUID,
        actorId: UUID,
        state: ChatParticipantStateEntity?,
    ): Long {
        val readAt = state?.readAt
        val lastReadMessageId = state?.lastReadMessageId
        return if (readAt == null || lastReadMessageId == null) {
            messageRepo.countByConversationIdAndSenderUserIdNot(conversationId, actorId)
        } else {
            messageRepo.countUnreadAfter(conversationId, actorId, readAt, lastReadMessageId)
        }
    }

    private fun participantState(conversationId: UUID, userId: UUID, now: Instant) = ChatParticipantStateEntity(
        id = UUID.randomUUID(),
        conversationId = conversationId,
        userId = userId,
        createdAt = now,
        updatedAt = now,
        unreadVersion = 0,
    )

    private fun isAfterReadMarker(message: ChatMessageEntity, state: ChatParticipantStateEntity): Boolean {
        val readAt = state.readAt ?: return true
        if (message.createdAt != readAt) return message.createdAt > readAt
        return state.lastReadMessageId?.let { message.id > it } ?: true
    }

    private fun states(conversation: ChatConversationEntity): Map<UUID, ChatParticipantStateEntity> =
        participantStateRepo.findByConversationIdInAndUserId(
            listOf(conversation.id),
            conversation.teacherUserId,
        ).associateBy(ChatParticipantStateEntity::userId) +
            participantStateRepo.findByConversationIdInAndUserId(
                listOf(conversation.id),
                conversation.studentUserId,
            ).associateBy(ChatParticipantStateEntity::userId)

    private fun message(
        entity: ChatMessageEntity,
        conversation: ChatConversationEntity,
        states: Map<UUID, ChatParticipantStateEntity>,
    ): ChatMessageResponse {
        val sender = appUserRepo.findById(entity.senderUserId).orElseThrow()
        val recipientId = if (entity.senderUserId == conversation.teacherUserId) conversation.studentUserId else conversation.teacherUserId
        val readAt = states[recipientId]?.readAt?.takeIf { it >= entity.createdAt }
        return ChatMessageResponse(
            id = entity.id,
            conversationId = entity.conversationId,
            senderSubject = sender.keycloakSubject,
            clientMessageId = entity.clientMessageId,
            text = entity.body,
            createdAt = entity.createdAt,
            deliveredAt = entity.deliveredAt,
            readAt = readAt,
        )
    }

    private fun counterpart(conversation: ChatConversationEntity, actor: AppUserEntity): AppUserEntity {
        val counterpartId = if (actor.id == conversation.teacherUserId) conversation.studentUserId else conversation.teacherUserId
        return appUserRepo.findById(counterpartId).orElseThrow()
    }

    private fun participantSubjects(conversation: ChatConversationEntity): Set<String> =
        appUserRepo.findByIdIn(listOf(conversation.teacherUserId, conversation.studentUserId))
            .mapTo(mutableSetOf(), AppUserEntity::keycloakSubject)

    private fun contact(user: AppUserEntity): ChatContactResponse = ChatContactResponse(
        subject = user.keycloakSubject,
        displayName = displayName(user),
        username = user.username,
        role = if (user.roles.hasApplicationRole(MetaData.Roles.TEACHER)) MetaData.Roles.TEACHER else MetaData.Roles.STUDENT,
    )

    private fun displayName(user: AppUserEntity): String =
        user.displayName?.trim()?.takeIf(String::isNotEmpty)
            ?: user.name?.trim()?.takeIf(String::isNotEmpty)
            ?: user.username?.trim()?.takeIf(String::isNotEmpty)
            ?: user.keycloakSubject

    private fun encodeCursor(message: ChatMessageEntity): String {
        val raw = "${message.createdAt}|${message.id}"
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.toByteArray(StandardCharsets.UTF_8))
    }

    private fun decodeCursor(cursor: String): Pair<Instant, UUID> = try {
        val raw = String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8)
        val separator = raw.lastIndexOf('|')
        Instant.parse(raw.substring(0, separator)) to UUID.fromString(raw.substring(separator + 1))
    } catch (_: RuntimeException) {
        fail(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_REQUEST)
    }

    private fun fail(status: HttpStatus, code: String): Nothing =
        throw ProjectResponseException.localized(status, code)

    private companion object {
        const val MAX_MESSAGE_LENGTH = 4_000
    }
}
