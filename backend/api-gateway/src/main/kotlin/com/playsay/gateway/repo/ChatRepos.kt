package com.playsay.gateway.repo

import com.playsay.gateway.entity.ChatConversationEntity
import com.playsay.gateway.entity.ChatEmailDigestEntity
import com.playsay.gateway.entity.ChatEmailDigestMessageEntity
import com.playsay.gateway.entity.ChatMessageEntity
import com.playsay.gateway.entity.ChatParticipantStateEntity
import com.playsay.gateway.entity.ChatPushDeliveryEntity
import com.playsay.gateway.entity.ChatPushSubscriptionEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface ChatConversationRepo : JpaRepository<ChatConversationEntity, UUID> {
    fun findByTeacherUserIdAndStudentUserId(teacherUserId: UUID, studentUserId: UUID): ChatConversationEntity?

    @Query(
        """
        select c from ChatConversationEntity c
         where c.teacherUserId = :userId or c.studentUserId = :userId
         order by coalesce(c.lastMessageAt, c.createdAt) desc, c.id desc
        """,
    )
    fun findForUser(userId: UUID): List<ChatConversationEntity>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from ChatConversationEntity c where c.id = :id")
    fun lockById(id: UUID): ChatConversationEntity?
}

interface ChatMessageRepo : JpaRepository<ChatMessageEntity, UUID> {
    fun findBySenderUserIdAndClientMessageId(senderUserId: UUID, clientMessageId: UUID): ChatMessageEntity?

    fun findFirstByConversationIdOrderByCreatedAtDescIdDesc(conversationId: UUID): ChatMessageEntity?

    @Query(
        """
        select m from ChatMessageEntity m
         where m.conversationId = :conversationId
         order by m.createdAt desc, m.id desc
        """,
    )
    fun findPage(
        conversationId: UUID,
        pageable: Pageable,
    ): List<ChatMessageEntity>

    @Query(
        """
        select m from ChatMessageEntity m
         where m.conversationId = :conversationId
           and (
             m.createdAt < :beforeCreatedAt
             or (m.createdAt = :beforeCreatedAt and m.id < :beforeId)
           )
         order by m.createdAt desc, m.id desc
        """,
    )
    fun findPageBefore(
        conversationId: UUID,
        beforeCreatedAt: Instant,
        beforeId: UUID,
        pageable: Pageable,
    ): List<ChatMessageEntity>

    fun countByConversationIdAndSenderUserIdNotAndCreatedAtAfter(
        conversationId: UUID,
        senderUserId: UUID,
        createdAt: Instant,
    ): Long

    fun countByConversationIdAndSenderUserIdNot(conversationId: UUID, senderUserId: UUID): Long

    @Query(
        """
        select count(m) from ChatMessageEntity m
         where m.conversationId = :conversationId
           and m.senderUserId <> :recipientUserId
           and (m.createdAt > :readAt or (m.createdAt = :readAt and m.id > :lastReadMessageId))
        """,
    )
    fun countUnreadAfter(
        conversationId: UUID,
        recipientUserId: UUID,
        readAt: Instant,
        lastReadMessageId: UUID,
    ): Long

    @Query(
        """
        select m
          from ChatMessageEntity m, ChatConversationEntity c
         where m.conversationId = c.id
           and m.senderUserId <> :recipientUserId
           and (c.teacherUserId = :recipientUserId or c.studentUserId = :recipientUserId)
           and m.deliveredAt is null
         order by m.createdAt, m.id
        """,
    )
    fun findPendingDelivery(recipientUserId: UUID): List<ChatMessageEntity>
}

interface ChatParticipantStateRepo : JpaRepository<ChatParticipantStateEntity, UUID> {
    fun findByConversationIdAndUserId(conversationId: UUID, userId: UUID): ChatParticipantStateEntity?
    fun findByConversationIdInAndUserId(conversationIds: Collection<UUID>, userId: UUID): List<ChatParticipantStateEntity>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from ChatParticipantStateEntity s where s.conversationId = :conversationId and s.userId = :userId")
    fun lockByConversationIdAndUserId(conversationId: UUID, userId: UUID): ChatParticipantStateEntity?
}

interface ChatEmailDigestRepo : JpaRepository<ChatEmailDigestEntity, UUID> {
    fun findFirstByRecipientUserIdAndStatusInOrderByCreatedAtDesc(
        recipientUserId: UUID,
        statuses: Collection<String>,
    ): ChatEmailDigestEntity?

    fun findFirstByRecipientUserIdAndStatusOrderBySentAtDesc(
        recipientUserId: UUID,
        status: String,
    ): ChatEmailDigestEntity?

    @Query(
        """
        select d
          from ChatEmailDigestEntity d
         where d.status = :status
           and d.dueAt <= :now
         order by d.dueAt, d.createdAt
        """,
    )
    fun findDue(status: String, now: Instant): List<ChatEmailDigestEntity>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from ChatEmailDigestEntity d where d.id = :id")
    fun lockById(id: UUID): ChatEmailDigestEntity?
}

interface ChatEmailDigestMessageRepo : JpaRepository<ChatEmailDigestMessageEntity, UUID> {
    fun existsByMessageId(messageId: UUID): Boolean
    fun findByDigestIdOrderByCreatedAtAsc(digestId: UUID): List<ChatEmailDigestMessageEntity>
}

interface ChatPushSubscriptionRepo : JpaRepository<ChatPushSubscriptionEntity, UUID> {
    fun findByEndpointHash(endpointHash: String): ChatPushSubscriptionEntity?
    fun findByUserIdAndActiveTrue(userId: UUID): List<ChatPushSubscriptionEntity>
}

interface ChatPushDeliveryRepo : JpaRepository<ChatPushDeliveryEntity, UUID> {
    fun existsByMessageIdAndSubscriptionId(messageId: UUID, subscriptionId: UUID): Boolean

    @Query(
        """
        select d.id from ChatPushDeliveryEntity d
         where d.status in :statuses
           and d.nextAttemptAt <= :now
           and (d.leaseUntil is null or d.leaseUntil <= :now)
         order by d.nextAttemptAt, d.createdAt, d.id
        """,
    )
    fun findDueIds(
        @Param("statuses") statuses: Collection<String>,
        @Param("now") now: Instant,
        pageable: Pageable,
    ): List<UUID>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from ChatPushDeliveryEntity d where d.id = :id")
    fun lockById(id: UUID): ChatPushDeliveryEntity?

    fun countByStatus(status: String): Long
}
