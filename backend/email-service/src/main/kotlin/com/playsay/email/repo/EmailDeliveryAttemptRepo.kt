package com.playsay.email.repo

import com.playsay.email.entity.EmailDeliveryAttemptEntity
import jakarta.persistence.LockModeType
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

interface EmailDeliveryAttemptRepo : JpaRepository<EmailDeliveryAttemptEntity, UUID> {
    fun findByIdempotencyKey(idempotencyKey: String): EmailDeliveryAttemptEntity?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from EmailDeliveryAttemptEntity e where e.idempotencyKey = :idempotencyKey")
    fun findLockedByIdempotencyKey(idempotencyKey: String): EmailDeliveryAttemptEntity?
}
