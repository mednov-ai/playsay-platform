package com.playsay.gateway.repo

import com.playsay.gateway.entity.MaterialHtmlGameEnrichmentEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

interface MaterialHtmlGameEnrichmentRepo : JpaRepository<MaterialHtmlGameEnrichmentEntity, UUID> {
    fun findByMaterialIdAndAssetIdAndBlockId(materialId: UUID, assetId: UUID, blockId: String): MaterialHtmlGameEnrichmentEntity?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        """
        select job from MaterialHtmlGameEnrichmentEntity job
         where (job.status in :readyStatuses and (job.nextAttemptAt is null or job.nextAttemptAt <= :now))
            or (job.status = :runningStatus and job.leaseUntil is not null and job.leaseUntil <= :now)
         order by job.updatedAt asc
        """,
    )
    fun findClaimable(
        readyStatuses: Collection<String>,
        runningStatus: String,
        now: Instant,
        pageable: Pageable,
    ): List<MaterialHtmlGameEnrichmentEntity>
}
