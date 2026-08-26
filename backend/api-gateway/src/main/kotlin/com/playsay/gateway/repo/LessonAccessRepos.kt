package com.playsay.gateway.repo

import com.playsay.gateway.entity.LessonAccessAuditEntity
import com.playsay.gateway.entity.LessonAccessLinkEntity
import com.playsay.gateway.entity.LessonAdmissionEntity
import com.playsay.gateway.entity.LessonEmailChallengeEntity
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.entity.LessonChallengeRateLimitEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

interface LessonAccessLinkRepo : JpaRepository<LessonAccessLinkEntity, UUID> {
    fun findFirstByLessonIdAndRevokedAtIsNullOrderByRevisionDesc(lessonId: UUID): LessonAccessLinkEntity?
    fun findFirstByLessonIdOrderByRevisionDesc(lessonId: UUID): LessonAccessLinkEntity?
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from LessonAccessLinkEntity l where l.lessonId = :lessonId and l.revokedAt is null")
    fun lockActiveByLessonId(lessonId: UUID): LessonAccessLinkEntity?

    @Modifying
    @Query("delete from LessonAccessLinkEntity l where l.revokedAt is not null and l.revokedAt < :cutoff")
    fun deleteRevokedBefore(cutoff: Instant): Int
}

interface LessonEntryAttemptRepo : JpaRepository<LessonEntryAttemptEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from LessonEntryAttemptEntity a where a.id = :id")
    fun lockById(id: UUID): LessonEntryAttemptEntity?

    fun findByLessonIdAndStateOrderByCreatedAtAsc(lessonId: UUID, state: String): List<LessonEntryAttemptEntity>

    @Modifying
    @Query("delete from LessonEntryAttemptEntity a where a.expiresAt < :now")
    fun deleteExpired(now: Instant): Int
}

interface LessonEmailChallengeRepo : JpaRepository<LessonEmailChallengeEntity, UUID> {
    fun findFirstByAttemptIdAndConsumedAtIsNullOrderByCreatedAtDesc(attemptId: UUID): LessonEmailChallengeEntity?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from LessonEmailChallengeEntity c where c.id = :id")
    fun lockById(id: UUID): LessonEmailChallengeEntity?

    @Modifying
    @Query("delete from LessonEmailChallengeEntity c where c.expiresAt < :now or c.consumedAt is not null and c.consumedAt < :now")
    fun deleteExpiredOrConsumedBefore(now: Instant): Int
}

interface LessonAdmissionRepo : JpaRepository<LessonAdmissionEntity, UUID> {
    fun findByLessonIdAndSubject(lessonId: UUID, subject: String): LessonAdmissionEntity?
    fun findByLessonIdOrderByCreatedAtAsc(lessonId: UUID): List<LessonAdmissionEntity>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from LessonAdmissionEntity a where a.lessonId = :lessonId and a.subject = :subject")
    fun lockByLessonIdAndSubject(lessonId: UUID, subject: String): LessonAdmissionEntity?
}

interface LessonAccessAuditRepo : JpaRepository<LessonAccessAuditEntity, UUID> {
    @Modifying
    @Query("delete from LessonAccessAuditEntity a where a.createdAt < :cutoff")
    fun deleteBefore(cutoff: Instant): Int
}

interface LessonChallengeRateLimitRepo : JpaRepository<LessonChallengeRateLimitEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from LessonChallengeRateLimitEntity r where r.dimensionHash = :dimensionHash and r.windowStart = :windowStart")
    fun lockByDimensionHashAndWindowStart(dimensionHash: String, windowStart: Instant): LessonChallengeRateLimitEntity?

    @Modifying
    @Query("delete from LessonChallengeRateLimitEntity r where r.expiresAt < :now")
    fun deleteExpired(now: Instant): Int
}
