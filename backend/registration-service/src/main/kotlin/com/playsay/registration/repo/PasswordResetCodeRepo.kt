package com.playsay.registration.repo

import com.playsay.registration.entity.PasswordResetCodeEntity
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface PasswordResetCodeRepo : JpaRepository<PasswordResetCodeEntity, UUID> {
    fun findByEmailNormalizedAndCodeHashAndStatus(
        emailNormalized: String,
        codeHash: String,
        status: String,
    ): PasswordResetCodeEntity?

    fun findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(
        emailNormalized: String,
        status: String,
    ): PasswordResetCodeEntity?
}
