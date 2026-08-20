package com.playsay.keyboard.service

import com.playsay.integration.delivery.IntegrationDeliveryState
import com.playsay.keyboard.repo.KeyboardVocabularyResultOutboxRepo
import com.playsay.keyboard.dto.KeyboardVocabularyDiagnosticsResponse
import io.micrometer.core.instrument.MeterRegistry
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong
import org.springframework.stereotype.Service

@Service
class KeyboardVocabularyDiagnostics(
    private val outboxRepo: KeyboardVocabularyResultOutboxRepo,
    private val outbox: KeyboardVocabularyResultOutbox,
    meters: MeterRegistry,
) {
    private val pendingGauge = AtomicLong()
    private val overdueGauge = AtomicLong()

    init {
        meters.gauge("playsay.keyboard.vocabulary.diagnostics.pending_callback", pendingGauge)
        meters.gauge("playsay.keyboard.vocabulary.diagnostics.overdue_callback", overdueGauge)
    }

    fun inspect(now: Instant = Instant.now()): KeyboardVocabularyDiagnosticsResponse {
        val pending = outboxRepo.countByStatus(PENDING)
        val overdue = outboxRepo.countByStatusAndNextAttemptAtBefore(PENDING, now)
        val oldest = outboxRepo.findFirstByStatusOrderByCreatedAtAsc(PENDING)?.createdAt
        pendingGauge.set(pending)
        overdueGauge.set(overdue)
        return KeyboardVocabularyDiagnosticsResponse(
            generatedAt = now,
            pendingCallbacks = pending,
            overdueCallbacks = overdue,
            oldestCallbackAgeSeconds = oldest?.let { Duration.between(it, now).seconds.coerceAtLeast(0) },
        )
    }

    fun reconcile(): KeyboardVocabularyDiagnosticsResponse {
        outbox.deliverDue()
        return inspect()
    }

    private companion object {
        val PENDING = IntegrationDeliveryState.PENDING.persistedValue
    }
}
