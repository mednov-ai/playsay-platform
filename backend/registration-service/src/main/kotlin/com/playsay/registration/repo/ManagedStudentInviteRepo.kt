package com.playsay.registration.repo

import com.playsay.registration.entity.ManagedStudentInviteEntity
import jakarta.persistence.LockModeType
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

interface ManagedStudentInviteRepo : JpaRepository<ManagedStudentInviteEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    fun findByTokenHashAndStatus(tokenHash: String, status: String): ManagedStudentInviteEntity?

    @Query(
        """
        select invite
          from ManagedStudentInviteEntity invite
         where invite.tokenHash = :tokenHash
           and invite.status = :status
        """,
    )
    fun findPendingLookupByTokenHashAndStatus(tokenHash: String, status: String): ManagedStudentInviteEntity?

    fun existsByTokenHash(tokenHash: String): Boolean
}
