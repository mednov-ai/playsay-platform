package com.playsay.registration.repo

import com.playsay.registration.entity.LessonAuthAssertionEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

interface LessonAuthAssertionRepo : JpaRepository<LessonAuthAssertionEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from LessonAuthAssertionEntity a where a.handleHash = :handleHash")
    fun lockByHandleHash(handleHash: String): LessonAuthAssertionEntity?

    @Modifying
    @Query("delete from LessonAuthAssertionEntity a where a.expiresAt < :cutoff or a.redeemedAt is not null and a.redeemedAt < :cutoff")
    fun deleteExpiredOrRedeemedBefore(cutoff: Instant): Int
}
