package com.playsay.registration.repo

import com.playsay.registration.entity.ManagedStudentInviteEntity
import jakarta.persistence.LockModeType
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock

interface ManagedStudentInviteRepo : JpaRepository<ManagedStudentInviteEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    fun findByTokenHashAndStatus(tokenHash: String, status: String): ManagedStudentInviteEntity?
}
