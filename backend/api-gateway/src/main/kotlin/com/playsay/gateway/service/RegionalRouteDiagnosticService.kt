package com.playsay.gateway.service

import com.playsay.gateway.dto.RegionalRouteDiagnosticEventRequest
import io.micrometer.core.instrument.MeterRegistry
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData

@Service
class RegionalRouteDiagnosticService(
    private val meters: MeterRegistry,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val windows = ConcurrentHashMap<String, RateWindow>()
    private val attempts = ConcurrentHashMap<AttemptKey, AttemptWindow>()

    @Synchronized
    fun record(actorSubject: String, event: RegionalRouteDiagnosticEventRequest) {
        val now = clock.instant()
        enforceRateLimit(actorSubject, now)
        pruneAttempts(now)
        val key = AttemptKey(actorSubject, event.attemptId)
        val attempt = attempts.computeIfAbsent(key) { AttemptWindow(UUID.randomUUID(), now) }

        meters.counter(
            "honey_school_regional_route_diagnostic_total",
            "stage", event.stage.name.lowercase(),
            "outcome", event.outcome.name.lowercase(),
            "connection_role", event.connectionRole.name.lowercase(),
            "transport_class", event.transportClass.name.lowercase(),
            "regional_endpoint_matched", event.regionalEndpointMatched?.toString() ?: "unknown",
        ).increment()
        logger.info(
            "regional_route_diagnostic attempt_id={} stage={} outcome={} connection_role={} transport_class={} regional_endpoint_matched={}",
            attempt.correlationId,
            event.stage,
            event.outcome,
            event.connectionRole,
            event.transportClass,
            event.regionalEndpointMatched,
        )
    }

    private fun enforceRateLimit(actorSubject: String, now: Instant) {
        windows.entries.removeIf { Duration.between(it.value.startedAt, now) >= RATE_WINDOW }
        if (!windows.containsKey(actorSubject) && windows.size >= MAX_TRACKED_ATTEMPTS) {
            throw ProjectResponseException.localized(HttpStatus.TOO_MANY_REQUESTS, MetaData.ErrorCodes.REGIONAL_DIAGNOSTIC_RATE_LIMIT)
        }
        val allowed = windows.compute(actorSubject) { _, current ->
            if (current == null || Duration.between(current.startedAt, now) >= RATE_WINDOW) {
                RateWindow(now, 1)
            } else {
                current.copy(count = minOf(current.count + 1, MAX_EVENTS_PER_WINDOW + 1))
            }
        }?.count ?: 1
        if (allowed > MAX_EVENTS_PER_WINDOW) {
            throw ProjectResponseException.localized(HttpStatus.TOO_MANY_REQUESTS, MetaData.ErrorCodes.REGIONAL_DIAGNOSTIC_RATE_LIMIT)
        }
    }

    private fun pruneAttempts(now: Instant) {
        attempts.entries.removeIf { Duration.between(it.value.startedAt, now) >= ATTEMPT_TTL }
        if (attempts.size >= MAX_TRACKED_ATTEMPTS) {
            attempts.entries.minByOrNull { it.value.startedAt }?.let { attempts.remove(it.key, it.value) }
        }
    }

    private data class AttemptKey(val subject: String, val clientAttempt: UUID)
    private data class AttemptWindow(val correlationId: UUID, val startedAt: Instant)

    private data class RateWindow(val startedAt: Instant, val count: Int)

    private companion object {
        val logger = LoggerFactory.getLogger(RegionalRouteDiagnosticService::class.java)
        val RATE_WINDOW: Duration = Duration.ofMinutes(1)
        val ATTEMPT_TTL: Duration = Duration.ofMinutes(15)
        const val MAX_EVENTS_PER_WINDOW = 120
        const val MAX_TRACKED_ATTEMPTS = 10_000
    }
}
