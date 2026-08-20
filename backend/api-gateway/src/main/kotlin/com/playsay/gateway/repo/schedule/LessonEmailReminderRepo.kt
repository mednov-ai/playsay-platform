package com.playsay.gateway.repo.schedule

import com.playsay.gateway.entity.LessonEmailReminderEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

interface LessonEmailReminderRepo : JpaRepository<LessonEmailReminderEntity, UUID> {
    fun deleteByLessonIdAndReminderTypeAndStatusIn(lessonId: UUID, reminderType: String, statuses: Collection<String>): Long

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from LessonEmailReminderEntity r where r.lessonId = :lessonId")
    fun deleteByLessonId(lessonId: UUID): Int

    fun existsByIdempotencyKey(idempotencyKey: String): Boolean

    fun findByIdempotencyKey(idempotencyKey: String): LessonEmailReminderEntity?

    fun findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lessonId: UUID): List<LessonEmailReminderEntity>

    fun findByLessonIdAndReminderTypeAndStatusIn(
        lessonId: UUID,
        reminderType: String,
        statuses: Collection<String>,
    ): List<LessonEmailReminderEntity>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        """
        select r
          from LessonEmailReminderEntity r
         where r.status = :status
           and r.dueAt <= :now
         order by r.dueAt, r.createdAt
        """,
    )
    fun findDue(status: String, now: Instant): List<LessonEmailReminderEntity>
}
