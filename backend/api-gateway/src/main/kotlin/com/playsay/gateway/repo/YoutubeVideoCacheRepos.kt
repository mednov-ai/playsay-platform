package com.playsay.gateway.repo

import com.playsay.gateway.entity.YoutubeVideoCacheEntity
import com.playsay.gateway.entity.YoutubeVideoCacheReferenceEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

interface YoutubeVideoCacheRepo : JpaRepository<YoutubeVideoCacheEntity, UUID> {
    fun findByVideoIdAndQuality(videoId: String, quality: String): YoutubeVideoCacheEntity?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        """
        select cache
          from YoutubeVideoCacheEntity cache
         where cache.unreferencedSince is null
           and exists (
               select reference.id
                 from YoutubeVideoCacheReferenceEntity reference
                where reference.cacheId = cache.id
           )
           and (
                (cache.status in :readyStatuses and (cache.nextAttemptAt is null or cache.nextAttemptAt <= :now))
             or (cache.status = :inProgressStatus and cache.leaseUntil is not null and cache.leaseUntil <= :now)
           )
         order by cache.updatedAt asc
        """,
    )
    fun findClaimable(
        readyStatuses: Collection<String>,
        inProgressStatus: String,
        now: Instant,
        pageable: Pageable,
    ): List<YoutubeVideoCacheEntity>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        """
        select cache
          from YoutubeVideoCacheEntity cache
         where cache.unreferencedSince is not null
           and cache.unreferencedSince <= :cutoff
         order by cache.unreferencedSince asc
        """,
    )
    fun findCleanupCandidates(cutoff: Instant, pageable: Pageable): List<YoutubeVideoCacheEntity>

    @Query("select coalesce(sum(cache.byteSize), 0) from YoutubeVideoCacheEntity cache where cache.status = 'READY'")
    fun sumReadyBytes(): Long
}

interface YoutubeVideoCacheReferenceRepo : JpaRepository<YoutubeVideoCacheReferenceEntity, UUID> {
    fun findByMaterialId(materialId: UUID): List<YoutubeVideoCacheReferenceEntity>

    fun countByCacheId(cacheId: UUID): Long
}
