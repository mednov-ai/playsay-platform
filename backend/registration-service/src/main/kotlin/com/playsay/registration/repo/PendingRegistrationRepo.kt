package com.playsay.registration.repo

import com.playsay.registration.entity.PendingRegistrationEntity
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface PendingRegistrationRepo : JpaRepository<PendingRegistrationEntity, UUID> {
    fun findByTokenHashAndStatus(tokenHash: String, status: String): PendingRegistrationEntity?

    fun findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(emailNormalized: String, status: String): PendingRegistrationEntity?
}
