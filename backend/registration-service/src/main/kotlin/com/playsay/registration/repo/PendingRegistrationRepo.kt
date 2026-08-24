package com.playsay.registration.repo

import com.playsay.registration.entity.PendingRegistrationEntity
import jakarta.persistence.LockModeType
import java.util.UUID
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.JpaRepository

interface PendingRegistrationRepo : JpaRepository<PendingRegistrationEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    fun findByTokenHash(tokenHash: String): PendingRegistrationEntity?

    fun findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(emailNormalized: String, status: String): PendingRegistrationEntity?
}
