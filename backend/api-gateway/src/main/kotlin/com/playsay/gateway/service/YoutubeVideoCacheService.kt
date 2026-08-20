package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.media.model.YoutubeVideoCacheResponse
import com.playsay.gateway.entity.YoutubeVideoCacheEntity
import com.playsay.gateway.entity.YoutubeVideoCacheReferenceEntity
import com.playsay.gateway.repo.YoutubeVideoCacheReferenceRepo
import com.playsay.gateway.repo.YoutubeVideoCacheRepo
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

data class YoutubeVideoCacheSnapshot(
    val id: UUID,
    val videoId: String,
    val quality: String,
    val status: String,
    val storageKey: String?,
    val selectedQuality: String?,
    val selectedHeight: Int?,
    val contentType: String?,
    val byteSize: Long?,
    val durationSeconds: Int?,
    val language: String?,
    val thumbnailUrl: String?,
    val attempts: Int,
)

object YoutubeVideoCacheStatuses {
    const val PENDING = "PENDING"
    const val IN_PROGRESS = "IN_PROGRESS"
    const val READY = "READY"
    const val RETRY = "RETRY"
    const val REJECTED = "REJECTED"
}

@Component
class YoutubeVideoCacheService(
    private val cacheRepo: YoutubeVideoCacheRepo,
    private val referenceRepo: YoutubeVideoCacheReferenceRepo,
    private val meterRegistry: MeterRegistry,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val clock: Clock = Clock.systemUTC(),
) {
    private val reconciliationLock = Any()

    init {
        Gauge.builder("playsay.youtube.cache.bytes", cacheRepo) { repository -> repository.sumReadyBytes().toDouble() }
            .description("Total bytes in ready YouTube cache objects")
            .register(meterRegistry)
    }

    @Transactional
    fun reconcileReferences(materialId: UUID, document: JsonNode) {
        synchronized(reconciliationLock) {
            reconcileLocked(materialId, youtubeBlocks(document))
        }
    }

    @Transactional
    fun reconcileReferences(materialId: UUID, serializedDocument: String) {
        val document = runCatching { objectMapper.readTree(serializedDocument) }.getOrNull() ?: return
        synchronized(reconciliationLock) {
            reconcileLocked(materialId, youtubeBlocks(document))
        }
    }

    @Transactional
    fun removeReferences(materialId: UUID) {
        synchronized(reconciliationLock) {
            reconcileLocked(materialId, emptyMap())
        }
    }

    @Transactional(readOnly = true)
    fun find(videoId: String, quality: String = YOUTUBE_CACHE_QUALITY): YoutubeVideoCacheSnapshot? =
        cacheRepo.findByVideoIdAndQuality(videoId, quality)?.toSnapshot()

    @Transactional
    fun claimNext(leaseDuration: Duration): YoutubeVideoCacheSnapshot? {
        val now = clock.instant()
        val cache = cacheRepo.findClaimable(
            readyStatuses = listOf(YoutubeVideoCacheStatuses.PENDING, YoutubeVideoCacheStatuses.RETRY),
            inProgressStatus = YoutubeVideoCacheStatuses.IN_PROGRESS,
            now = now,
            pageable = PageRequest.of(0, 1),
        ).firstOrNull() ?: return null
        cache.status = YoutubeVideoCacheStatuses.IN_PROGRESS
        cache.attempts += 1
        cache.leaseUntil = now.plus(leaseDuration)
        cache.nextAttemptAt = null
        cache.lastErrorCode = null
        cache.updatedAt = now
        return cacheRepo.save(cache).toSnapshot()
    }

    @Transactional
    fun recordMetadata(cacheId: UUID, metadata: YoutubeVideoMeta) {
        val cache = cacheRepo.findById(cacheId).orElse(null) ?: return
        cache.durationSeconds = metadata.durationSeconds
        cache.language = metadata.language
        cache.thumbnailUrl = metadata.thumbnailUrl
        cache.updatedAt = clock.instant()
        cacheRepo.save(cache)
    }

    @Transactional
    fun markReady(cacheId: UUID, result: YoutubeVideoCacheResponse) {
        val cache = cacheRepo.findById(cacheId).orElse(null) ?: return
        val now = clock.instant()
        cache.status = YoutubeVideoCacheStatuses.READY
        cache.storageKey = result.storageKey
        cache.selectedQuality = result.selectedQuality.value
        cache.selectedHeight = result.selectedHeight
        cache.contentType = result.contentType
        cache.byteSize = result.byteSize
        cache.durationSeconds = result.durationSeconds ?: cache.durationSeconds
        cache.language = result.language ?: cache.language
        cache.thumbnailUrl = result.thumbnailUrl ?: cache.thumbnailUrl
        cache.leaseUntil = null
        cache.nextAttemptAt = null
        cache.lastErrorCode = null
        cache.readyAt = now
        cache.updatedAt = now
        cacheRepo.save(cache)
    }

    @Transactional
    fun markRejected(cacheId: UUID, reason: String) {
        val cache = cacheRepo.findById(cacheId).orElse(null) ?: return
        cache.status = YoutubeVideoCacheStatuses.REJECTED
        cache.leaseUntil = null
        cache.nextAttemptAt = null
        cache.lastErrorCode = reason.take(120)
        cache.updatedAt = clock.instant()
        cacheRepo.save(cache)
    }

    @Transactional
    fun markRetry(cacheId: UUID, reason: String, delay: Duration) {
        val cache = cacheRepo.findById(cacheId).orElse(null) ?: return
        val now = clock.instant()
        cache.status = YoutubeVideoCacheStatuses.RETRY
        cache.leaseUntil = null
        cache.nextAttemptAt = now.plus(delay)
        cache.lastErrorCode = reason.take(120)
        cache.updatedAt = now
        cacheRepo.save(cache)
    }

    @Transactional
    fun markUnavailable(videoId: String) {
        val cache = cacheRepo.findByVideoIdAndQuality(videoId, YOUTUBE_CACHE_QUALITY) ?: return
        if (cache.status != YoutubeVideoCacheStatuses.READY) {
            return
        }
        val now = clock.instant()
        cache.status = YoutubeVideoCacheStatuses.RETRY
        cache.nextAttemptAt = now
        cache.leaseUntil = null
        cache.lastErrorCode = "YOUTUBE_CACHE_OBJECT_UNAVAILABLE"
        cache.updatedAt = now
        cacheRepo.save(cache)
    }

    @Transactional
    fun claimCleanupCandidate(retention: Duration, leaseDuration: Duration): YoutubeVideoCacheSnapshot? {
        val now = clock.instant()
        val cache = cacheRepo.findCleanupCandidates(now.minus(retention), PageRequest.of(0, 1)).firstOrNull()
            ?: return null
        cache.status = YoutubeVideoCacheStatuses.IN_PROGRESS
        cache.leaseUntil = now.plus(leaseDuration)
        cache.updatedAt = now
        return cacheRepo.save(cache).toSnapshot()
    }

    @Transactional
    fun completeCleanup(cacheId: UUID): Boolean {
        if (referenceRepo.countByCacheId(cacheId) > 0) {
            cacheRepo.findById(cacheId).orElse(null)?.let { cache ->
                cache.unreferencedSince = null
                cache.status = YoutubeVideoCacheStatuses.PENDING
                cache.nextAttemptAt = clock.instant()
                cache.leaseUntil = null
                cache.updatedAt = clock.instant()
                cacheRepo.save(cache)
            }
            return false
        }
        cacheRepo.deleteById(cacheId)
        return true
    }

    @Transactional
    fun markCleanupRetry(cacheId: UUID) {
        cacheRepo.findById(cacheId).orElse(null)?.let { cache ->
            val referenced = referenceRepo.countByCacheId(cacheId) > 0
            cache.status = if (referenced) YoutubeVideoCacheStatuses.PENDING else YoutubeVideoCacheStatuses.READY
            cache.nextAttemptAt = if (referenced) clock.instant() else null
            if (referenced) {
                cache.unreferencedSince = null
            }
            cache.leaseUntil = null
            cache.updatedAt = clock.instant()
            cacheRepo.save(cache)
        }
    }

    private fun reconcileLocked(materialId: UUID, desiredBlocks: Map<String, String>) {
        val now = clock.instant()
        val existingReferences = referenceRepo.findByMaterialId(materialId).associateBy { reference -> reference.blockId }

        existingReferences.values
            .filter { reference -> desiredBlocks[reference.blockId] == null || cacheRepo.findById(reference.cacheId).orElse(null)?.videoId != desiredBlocks[reference.blockId] }
            .forEach { reference -> removeReference(reference, now) }

        val remainingReferences = referenceRepo.findByMaterialId(materialId).associateBy { reference -> reference.blockId }
        desiredBlocks.forEach { (blockId, videoId) ->
            val existing = remainingReferences[blockId]
            if (existing != null && cacheRepo.findById(existing.cacheId).orElse(null)?.videoId == videoId) {
                cacheRepo.findById(existing.cacheId).orElse(null)?.let { cache ->
                    if (cache.unreferencedSince != null) {
                        cache.unreferencedSince = null
                        cache.updatedAt = now
                        cacheRepo.save(cache)
                    }
                }
                return@forEach
            }

            val cache = cacheRepo.findByVideoIdAndQuality(videoId, YOUTUBE_CACHE_QUALITY)
                ?: cacheRepo.saveAndFlush(
                    YoutubeVideoCacheEntity(
                        id = UUID.randomUUID(),
                        videoId = videoId,
                        quality = YOUTUBE_CACHE_QUALITY,
                        status = YoutubeVideoCacheStatuses.PENDING,
                        nextAttemptAt = now,
                        createdAt = now,
                        updatedAt = now,
                    ),
                )
            cache.unreferencedSince = null
            cache.updatedAt = now
            cacheRepo.save(cache)
            referenceRepo.save(
                YoutubeVideoCacheReferenceEntity(
                    id = UUID.randomUUID(),
                    cacheId = cache.id,
                    materialId = materialId,
                    blockId = blockId,
                    createdAt = now,
                ),
            )
        }
    }

    private fun removeReference(reference: YoutubeVideoCacheReferenceEntity, now: Instant) {
        val cacheId = reference.cacheId
        referenceRepo.delete(reference)
        referenceRepo.flush()
        if (referenceRepo.countByCacheId(cacheId) == 0L) {
            cacheRepo.findById(cacheId).orElse(null)?.let { cache ->
                cache.unreferencedSince = now
                cache.leaseUntil = null
                cache.updatedAt = now
                cacheRepo.save(cache)
            }
        }
    }

    private fun youtubeBlocks(document: JsonNode): Map<String, String> {
        val pages = document.path("pages")
        if (!pages.isArray) {
            return emptyMap()
        }
        return pages.asSequence()
            .flatMap { page -> page.path("blocks").asSequence() }
            .filter { block -> block.path("type").asText() == "videoEmbed" && block.path("provider").asText().equals("YOUTUBE", ignoreCase = true) }
            .mapNotNull { block ->
                val blockId = block.path("id").asText().trim().takeIf { value -> value.isNotEmpty() } ?: return@mapNotNull null
                val videoId = YoutubeVideoSupport.parseVideoId(block.path("url").asText(null)) ?: return@mapNotNull null
                blockId to videoId
            }
            .toMap()
    }

    private fun YoutubeVideoCacheEntity.toSnapshot(): YoutubeVideoCacheSnapshot =
        YoutubeVideoCacheSnapshot(
            id = id,
            videoId = videoId,
            quality = quality,
            status = status,
            storageKey = storageKey,
            selectedQuality = selectedQuality,
            selectedHeight = selectedHeight,
            contentType = contentType,
            byteSize = byteSize,
            durationSeconds = durationSeconds,
            language = language,
            thumbnailUrl = thumbnailUrl,
            attempts = attempts,
        )

    companion object {
        const val YOUTUBE_CACHE_QUALITY = "MEDIUM"
    }
}
