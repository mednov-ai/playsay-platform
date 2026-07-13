package com.playsay.gateway.service

import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.utils.MetaData
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import java.time.Duration
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.atomic.AtomicBoolean
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class YoutubeVideoCacheWorker(
    private val cacheService: YoutubeVideoCacheService,
    private val mediaClient: YoutubeMediaClient,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val meterRegistry: MeterRegistry,
    @param:Qualifier("youtubeVideoCacheExecutor") private val executor: ExecutorService,
    @param:Value("\${playsay.video.youtube.cache.enabled:false}") private val cacheEnabled: Boolean,
    @param:Value("\${playsay.video.youtube.cache.lease-seconds:900}") private val leaseSeconds: Long,
    @param:Value("\${playsay.video.youtube.cache.retention-days:30}") private val retentionDays: Long,
) {
    private val busy = AtomicBoolean(false)

    @EventListener(ApplicationReadyEvent::class)
    fun reconcileExistingMaterials() {
        val materials = runCatching {
            lessonMaterialRepo.findAllByStatusNot(MetaData.MaterialStatuses.ARCHIVED)
        }.getOrElse {
            logger.warn("YouTube cache startup reconciliation skipped because materials are unavailable", it)
            return
        }
        materials.forEach { material ->
            runCatching { cacheService.reconcileReferences(material.id, material.document) }
                .onFailure { logger.warn("YouTube cache startup reconciliation failed materialId={}", material.id, it) }
        }
    }

    @Scheduled(
        fixedDelayString = "\${playsay.video.youtube.cache.poll-delay-ms:5000}",
        initialDelayString = "\${playsay.video.youtube.cache.initial-delay-ms:5000}",
    )
    fun dispatch() {
        if (!cacheEnabled || !busy.compareAndSet(false, true)) {
            return
        }
        val work = runCatching { cacheService.claimNext(Duration.ofSeconds(leaseSeconds.coerceAtLeast(60))) }
            .getOrElse {
                busy.set(false)
                logger.warn("YouTube cache worker could not claim a job", it)
                return
            }
        if (work == null) {
            busy.set(false)
            return
        }
        runCatching {
            executor.execute {
                try {
                    process(work)
                } finally {
                    busy.set(false)
                }
            }
        }.onFailure {
            busy.set(false)
            logger.warn("YouTube cache worker could not submit a job videoId={}", work.videoId, it)
        }
    }

    @Scheduled(
        fixedDelayString = "\${playsay.video.youtube.cache.cleanup-delay-ms:86400000}",
        initialDelayString = "\${playsay.video.youtube.cache.cleanup-initial-delay-ms:60000}",
    )
    fun cleanup() {
        if (!cacheEnabled || !busy.compareAndSet(false, true)) {
            return
        }
        runCatching {
            executor.execute {
                try {
                    cleanupCandidates()
                } finally {
                    busy.set(false)
                }
            }
        }.onFailure {
            busy.set(false)
            logger.warn("YouTube cache cleanup could not submit work", it)
        }
    }

    private fun cleanupCandidates() {
        while (true) {
            val candidate = runCatching {
                cacheService.claimCleanupCandidate(
                    retention = Duration.ofDays(retentionDays.coerceAtLeast(1)),
                    leaseDuration = Duration.ofSeconds(leaseSeconds.coerceAtLeast(60)),
                )
            }.getOrElse {
                logger.warn("YouTube cache cleanup could not claim an object", it)
                return
            } ?: return
            val deleted = runCatching { mediaClient.deleteVideoCache(candidate.videoId, candidate.quality) }
                .getOrDefault(false)
            if (!deleted) {
                cacheService.markCleanupRetry(candidate.id)
                meterRegistry.counter("playsay.youtube.cache.cleanup", "result", "failed").increment()
                return
            }
            if (cacheService.completeCleanup(candidate.id)) {
                meterRegistry.counter("playsay.youtube.cache.cleanup", "result", "deleted").increment()
                logger.info("YouTube cache object deleted videoId={} quality={}", candidate.videoId, candidate.quality)
            }
        }
    }

    private fun process(work: YoutubeVideoCacheSnapshot) {
        val sample = Timer.start(meterRegistry)
        val metadata = mediaClient.resolveMetadata(work.videoId)
        if (metadata == null) {
            retry(work, "YOUTUBE_METADATA_NOT_FOUND")
            sample.stop(cacheTimer("retry"))
            return
        }
        cacheService.recordMetadata(work.id, metadata)
        val policy = YoutubeVideoSupport.videoMeetsPolicy(metadata)
        if (!policy.approved) {
            cacheService.markRejected(work.id, policy.reason ?: "YOUTUBE_CACHE_REJECTED")
            meterRegistry.counter("playsay.youtube.cache.jobs", "result", "rejected").increment()
            sample.stop(cacheTimer("rejected"))
            logger.info(
                "YouTube cache job rejected videoId={} attempt={} reason={} durationSeconds={} language={}",
                work.videoId,
                work.attempts,
                policy.reason,
                metadata.durationSeconds,
                metadata.language,
            )
            return
        }

        val result = try {
            mediaClient.cacheVideo(
                YoutubeVideoCacheCommand(
                    videoId = work.videoId,
                    requestedQuality = work.quality,
                ),
            )
        } catch (rejected: YoutubeVideoCacheRejectedException) {
            cacheService.markRejected(work.id, rejected.reason)
            meterRegistry.counter("playsay.youtube.cache.jobs", "result", "rejected").increment()
            sample.stop(cacheTimer("rejected"))
            logger.info("YouTube cache job rejected videoId={} attempt={} reason={}", work.videoId, work.attempts, rejected.reason)
            return
        }
        if (result == null) {
            retry(work, "YOUTUBE_CACHE_UNAVAILABLE")
            sample.stop(cacheTimer("retry"))
            return
        }
        cacheService.markReady(work.id, result)
        meterRegistry.counter("playsay.youtube.cache.jobs", "result", "ready").increment()
        sample.stop(cacheTimer("ready"))
        logger.info(
            "YouTube cache job ready videoId={} attempt={} selectedQuality={} selectedHeight={} byteSize={}",
            work.videoId,
            work.attempts,
            result.selectedQuality,
            result.selectedHeight,
            result.byteSize,
        )
    }

    private fun retry(work: YoutubeVideoCacheSnapshot, reason: String) {
        val delay = retryDelay(work.attempts)
        cacheService.markRetry(work.id, reason, delay)
        meterRegistry.counter("playsay.youtube.cache.jobs", "result", "retry").increment()
        logger.warn(
            "YouTube cache job scheduled for retry videoId={} attempt={} delaySeconds={} reason={}",
            work.videoId,
            work.attempts,
            delay.seconds,
            reason,
        )
    }

    private fun retryDelay(attempts: Int): Duration =
        when (attempts) {
            1 -> Duration.ofMinutes(1)
            2 -> Duration.ofMinutes(5)
            3 -> Duration.ofMinutes(30)
            else -> Duration.ofHours(6)
        }

    private fun cacheTimer(result: String): Timer =
        meterRegistry.timer("playsay.youtube.cache.job.duration", "result", result)

    companion object {
        private val logger = LoggerFactory.getLogger(YoutubeVideoCacheWorker::class.java)
    }
}
