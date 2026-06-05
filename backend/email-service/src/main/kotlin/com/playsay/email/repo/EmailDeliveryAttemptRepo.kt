package com.playsay.email.repo

import com.playsay.email.entity.EmailDeliveryAttemptEntity
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface EmailDeliveryAttemptRepo : JpaRepository<EmailDeliveryAttemptEntity, UUID> {
    fun findByIdempotencyKey(idempotencyKey: String): EmailDeliveryAttemptEntity?
}
