package com.playsay.gateway.repo

import com.playsay.gateway.entity.ChatConversationEntity
import com.playsay.gateway.entity.ChatEmailDigestEntity
import com.playsay.gateway.entity.ChatEmailDigestMessageEntity
import com.playsay.gateway.entity.ChatMessageEntity
import com.playsay.gateway.entity.ChatParticipantStateEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

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
           and (
             :beforeCreatedAt is null
             or m.createdAt < :beforeCreatedAt
             or (m.createdAt = :beforeCreatedAt and m.id < :beforeId)
           )
         order by m.createdAt desc, m.id desc
        """,
    )
    fun findPage(
        conversationId: UUID,
        beforeCreatedAt: Instant?,
        beforeId: UUID?,
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
