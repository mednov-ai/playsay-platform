package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.integration.delivery.IntegrationDeliveryState
import com.playsay.integration.delivery.exponentialRetryDelay
import com.playsay.vocabulary.entity.VocabularyIntegrationOutboxEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.repo.VocabularyIntegrationOutboxRepo
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory

data class VocabularyAssignmentProgressPayload(
    val eventId: UUID,
    val sessionId: UUID,
    val ownerSubject: String,
    val revision: Long,
    val state: String,
    val completionRatio: Double?,
    val accuracy: Double?,
    val difficultWordCount: Int?,
    val learnerSnapshotId: UUID,
    val distinctGradedPrompts: Int,
    val distinctEntries: Int,
    val hintsUsed: Int,
    val activeDurationMs: Long,
    val masteryRatio: Double?,
    val completionPolicy: String,
    val completionPolicyVersion: String,
    val updatedAt: Instant,
)

@Component
class VocabularyAssignmentProgressOutbox(
    private val outbox: VocabularyIntegrationOutboxRepo,
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.assignment-integration.gateway-base-url:http://api-gateway.playsay-dev.svc.cluster.local}")
    private val gatewayBaseUrl: String,
    @param:Value("\${playsay.user-data.service-token:}")
    private val serviceToken: String,
    private val meters: MeterRegistry,
) {
    private val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build()

    fun enqueue(
        assignmentId: UUID,
        session: VocabularyPracticeSessionEntity,
        evaluation: VocabularyHomeworkProgressEvaluation,
    ) {
        if (outbox.findBySessionIdAndSessionRevision(session.id, session.revision) != null) return
        val now = Instant.now()
        val eventId = UUID.randomUUID()
        val payload = VocabularyAssignmentProgressPayload(
            eventId = eventId,
            sessionId = session.id,
            ownerSubject = session.ownerSubject,
            revision = session.revision,
            state = evaluation.state,
            completionRatio = evaluation.completionRatio,
            accuracy = evaluation.accuracy,
            difficultWordCount = evaluation.difficultWordCount,
            learnerSnapshotId = session.id,
            distinctGradedPrompts = evaluation.distinctGradedPrompts,
            distinctEntries = evaluation.distinctEntries,
            hintsUsed = evaluation.hintsUsed,
            activeDurationMs = evaluation.activeDurationMs,
            masteryRatio = evaluation.masteryRatio,
            completionPolicy = evaluation.completionPolicy.name,
            completionPolicyVersion = evaluation.completionPolicyVersion,
            updatedAt = session.updatedAt,
        )
        outbox.save(
            VocabularyIntegrationOutboxEntity().apply {
                id = eventId
                this.assignmentId = assignmentId
                this.sessionId = session.id
                sessionRevision = session.revision
                this.payload = objectMapper.writeValueAsString(payload)
                status = PENDING
                nextAttemptAt = now
                createdAt = now
                updatedAt = now
            },
        )
    }

    @Scheduled(
        fixedDelayString = "\${playsay.assignment-integration.retry-delay-ms:10000}",
        initialDelayString = "\${playsay.assignment-integration.retry-delay-ms:10000}",
    )
    fun deliverDue() {
        outbox.findTop50ByStatusAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(PENDING, Instant.now())
            .forEach { event -> deliver(event.id) }
    }

    private fun deliver(eventId: UUID) {
        val event = outbox.findById(eventId).orElse(null) ?: return
        if (event.status != PENDING) return
        meters.timer("playsay.vocabulary.outbox.age", "kind", "assignment_progress")
            .record(Duration.between(event.createdAt, Instant.now()).coerceAtLeast(Duration.ZERO))
        runCatching {
            check(serviceToken.isNotBlank()) { "Vocabulary integration token is not configured" }
            val request = HttpRequest.newBuilder(
                URI.create(
                    gatewayBaseUrl.trimEnd('/') +
                        "/internal/vocabulary/assignments/${event.assignmentId}/progress",
                ),
            )
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .header("X-PlaySay-Service-Token", serviceToken)
                .POST(HttpRequest.BodyPublishers.ofString(event.payload))
                .build()
            val response = httpClient.send(request, HttpResponse.BodyHandlers.discarding())
            check(response.statusCode() in 200..299) {
                "Vocabulary progress callback failed with HTTP ${response.statusCode()}"
            }
        }.onSuccess {
            val current = outbox.findById(eventId).orElse(null) ?: return@onSuccess
            current.status = COMPLETED
            current.lastError = null
            current.updatedAt = Instant.now()
            outbox.save(current)
            meters.counter("playsay.vocabulary.outbox.delivered", "kind", "assignment_progress").increment()
        }.onFailure { error ->
            val current = outbox.findById(eventId).orElse(null) ?: return@onFailure
            val now = Instant.now()
            current.attemptCount += 1
            current.lastError = listOfNotNull(error::class.simpleName, error.message).joinToString(": ").take(240)
            current.nextAttemptAt = now.plus(exponentialRetryDelay(current.attemptCount))
            current.updatedAt = now
            outbox.save(current)
            meters.counter(
                "playsay.vocabulary.outbox.retry",
                "kind",
                "assignment_progress",
                "error",
                error.javaClass.simpleName,
            ).increment()
            logger.warn(
                "Vocabulary assignment callback deferred: eventId={}, attemptCount={}, errorType={}",
                current.id,
                current.attemptCount,
                error.javaClass.simpleName,
            )
        }
    }

    private companion object {
        val logger = LoggerFactory.getLogger(VocabularyAssignmentProgressOutbox::class.java)
        val PENDING = IntegrationDeliveryState.PENDING.persistedValue
        val COMPLETED = IntegrationDeliveryState.COMPLETED.persistedValue
    }
}
