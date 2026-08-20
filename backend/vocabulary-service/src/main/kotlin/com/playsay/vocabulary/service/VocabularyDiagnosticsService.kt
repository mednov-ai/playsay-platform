package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.VocabularyMediaAssetState
import com.playsay.vocabulary.dto.VocabularyMediaGenerationState
import com.playsay.vocabulary.dto.VocabularyDiagnosticsResponse
import com.playsay.vocabulary.dto.VocabularyQueueDiagnostic
import com.playsay.vocabulary.repo.VocabularyIntegrationOutboxRepo
import com.playsay.vocabulary.repo.VocabularyMediaAssetRepo
import com.playsay.vocabulary.repo.VocabularyMediaGenerationRequestRepo
import com.playsay.vocabulary.repo.VocabularyProjectionQueueRepo
import io.micrometer.core.instrument.MeterRegistry
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class VocabularyDiagnosticsService(
    private val projectionQueue: VocabularyProjectionQueueRepo,
    private val assignmentOutbox: VocabularyIntegrationOutboxRepo,
    private val generations: VocabularyMediaGenerationRequestRepo,
    private val assets: VocabularyMediaAssetRepo,
    private val storage: VocabularyMediaObjectStorage,
    private val projector: VocabularyMemoryProjector,
    private val progressOutbox: VocabularyAssignmentProgressOutbox,
    private val media: VocabularyMediaService,
    meters: MeterRegistry,
) {
    private val staleProjectionGauge = AtomicLong()
    private val pendingAssignmentGauge = AtomicLong()
    private val stuckGenerationGauge = AtomicLong()
    private val missingObjectGauge = AtomicLong()

    init {
        meters.gauge("playsay.vocabulary.diagnostics.stale_projection", staleProjectionGauge)
        meters.gauge("playsay.vocabulary.diagnostics.pending_assignment_callback", pendingAssignmentGauge)
        meters.gauge("playsay.vocabulary.diagnostics.stuck_generation", stuckGenerationGauge)
        meters.gauge("playsay.vocabulary.diagnostics.missing_media_object", missingObjectGauge)
    }

    @Transactional(readOnly = true)
    fun inspect(now: Instant = Instant.now()): VocabularyDiagnosticsResponse {
        val projection = queueDiagnostic(
            projectionQueue.countByStatus(PENDING),
            projectionQueue.countByStatusAndNextAttemptAtBefore(PENDING, now),
            projectionQueue.findFirstByStatusOrderByCreatedAtAsc(PENDING)?.createdAt,
            now,
        )
        val callbacks = queueDiagnostic(
            assignmentOutbox.countByStatus(PENDING),
            assignmentOutbox.countByStatusAndNextAttemptAtBefore(PENDING, now),
            assignmentOutbox.findFirstByStatusOrderByCreatedAtAsc(PENDING)?.createdAt,
            now,
        )
        val generation = queueDiagnostic(
            generations.countByState(VocabularyMediaGenerationState.PENDING) + generations.countByState(VocabularyMediaGenerationState.PROCESSING),
            generations.countByStateAndNextAttemptAtBefore(VocabularyMediaGenerationState.PENDING, now) +
                generations.findTop50ByStateAndUpdatedAtBeforeOrderByUpdatedAtAsc(
                    VocabularyMediaGenerationState.PROCESSING,
                    now.minus(STUCK_GENERATION_AFTER),
                ).size,
            listOfNotNull(
                generations.findFirstByStateOrderByCreatedAtAsc(VocabularyMediaGenerationState.PENDING)?.createdAt,
                generations.findFirstByStateOrderByCreatedAtAsc(VocabularyMediaGenerationState.PROCESSING)?.createdAt,
            ).minOrNull(),
            now,
        )
        val inspected = assets.findTop50ByStateInAndStorageKeyIsNotNullOrderByUpdatedAtAsc(
            mediaObjectStates,
        )
        val missing = inspected.count { asset -> asset.storageKey?.let(storage::exists) != true }
        staleProjectionGauge.set(projection.overdue)
        pendingAssignmentGauge.set(callbacks.pending)
        stuckGenerationGauge.set(generation.overdue)
        missingObjectGauge.set(missing.toLong())
        return VocabularyDiagnosticsResponse(now, projection, callbacks, generation, missing, inspected.size)
    }

    @Scheduled(fixedDelayString = "\${playsay.vocabulary.reconciliation-ms:60000}")
    fun reconcile() {
        val now = Instant.now()
        generations.findTop50ByStateAndUpdatedAtBeforeOrderByUpdatedAtAsc(
            VocabularyMediaGenerationState.PROCESSING,
            now.minus(STUCK_GENERATION_AFTER),
        ).forEach { request ->
            request.state = VocabularyMediaGenerationState.PENDING
            request.failureCode = "STUCK_PROCESSING_RETRY"
            request.nextAttemptAt = now
            request.updatedAt = now
            generations.save(request)
            logger.warn(
                "Vocabulary generation reconciled: requestId={}, attemptCount={}",
                request.id,
                request.attemptCount,
            )
        }
        projector.retryPending()
        progressOutbox.deliverDue()
        media.processPending()
        inspect(now)
    }

    private fun queueDiagnostic(pending: Long, overdue: Long, oldest: Instant?, now: Instant) =
        VocabularyQueueDiagnostic(
            pending = pending,
            overdue = overdue,
            oldestAgeSeconds = oldest?.let { Duration.between(it, now).seconds.coerceAtLeast(0) },
        )

    private companion object {
        val logger = LoggerFactory.getLogger(VocabularyDiagnosticsService::class.java)
        val STUCK_GENERATION_AFTER: Duration = Duration.ofMinutes(15)
        val mediaObjectStates = setOf(
            VocabularyMediaAssetState.CANDIDATE,
            VocabularyMediaAssetState.APPROVED,
            VocabularyMediaAssetState.SUPERSEDED,
        )
        const val PENDING = "PENDING"
    }
}
