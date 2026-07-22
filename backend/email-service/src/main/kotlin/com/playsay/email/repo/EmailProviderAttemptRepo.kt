package com.playsay.email.repo

import com.playsay.email.entity.EmailProviderAttemptEntity
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.domain.Pageable

interface EmailProviderAttemptRepo : JpaRepository<EmailProviderAttemptEntity, UUID> {
    fun findAllByEmailDeliveryIdOrderByAttemptNumberDesc(emailDeliveryId: UUID): List<EmailProviderAttemptEntity>

    fun findByProviderAndProviderJobId(provider: String, providerJobId: String): EmailProviderAttemptEntity?

    @Query(
        """
        select case when count(e) > 0 then true else false end from EmailProviderAttemptEntity e
        where e.provider = :provider
          and e.providerStatus not in :terminalStatuses
          and e.trackingUntil > :now
        """,
    )
    fun hasTrackable(
        provider: String,
        terminalStatuses: Collection<String>,
        now: Instant,
    ): Boolean

    @Query(
        """
        select e from EmailProviderAttemptEntity e
        where e.provider = :provider
          and e.providerStatus not in :terminalStatuses
          and e.trackingUntil > :now
        order by e.providerCheckedAt asc, e.createdAt asc
        """,
    )
    fun findTrackable(
        provider: String,
        terminalStatuses: Collection<String>,
        now: Instant,
        pageable: Pageable,
    ): List<EmailProviderAttemptEntity>

    @Query(
        """
        select e from EmailProviderAttemptEntity e
        where e.providerStatus not in :terminalStatuses
          and e.trackingUntil is not null
          and e.trackingUntil <= :now
        """,
    )
    fun findExpired(terminalStatuses: Collection<String>, now: Instant): List<EmailProviderAttemptEntity>
}
