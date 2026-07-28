package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
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
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

data class VocabularyAssignmentProgressPayload(
    val eventId: UUID,
    val sessionId: UUID,
    val ownerSubject: String,
    val revision: Long,
    val state: String,
    val completionRatio: Double?,
    val accuracy: Double?,
    val difficultWordCount: Int?,
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
) {
    private val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build()

    fun enqueue(
        assignmentId: UUID,
        session: VocabularyPracticeSessionEntity,
        completedItems: Int,
        totalItems: Int,
        difficultWordCount: Int,
    ) {
        if (outbox.findBySessionIdAndSessionRevision(session.id, session.revision) != null) return
        val now = Instant.now()
        val eventId = UUID.randomUUID()
        val payload = VocabularyAssignmentProgressPayload(
            eventId = eventId,
            sessionId = session.id,
            ownerSubject = session.ownerSubject,
            revision = session.revision,
            state = when (session.status) {
                SessionStatus.NOT_STARTED -> "NOT_STARTED"
                SessionStatus.IN_PROGRESS, SessionStatus.PAUSED -> "IN_PROGRESS"
                SessionStatus.COMPLETED -> "COMPLETED"
                SessionStatus.CANCELLED -> "FAILED"
            },
            completionRatio = totalItems.takeIf { it > 0 }?.let { completedItems.toDouble() / it },
            accuracy = session.attemptCount.takeIf { it > 0 }?.let { session.correctCount.toDouble() / it },
            difficultWordCount = difficultWordCount,
            updatedAt = session.updatedAt,
        )
        outbox.save(
            VocabularyIntegrationOutboxEntity(
                id = eventId,
                assignmentId = assignmentId,
                sessionId = session.id,
                sessionRevision = session.revision,
                payload = objectMapper.writeValueAsString(payload),
                status = PENDING,
                nextAttemptAt = now,
                createdAt = now,
                updatedAt = now,
            ),
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
        }.onFailure { error ->
            val current = outbox.findById(eventId).orElse(null) ?: return@onFailure
            val now = Instant.now()
            current.attemptCount += 1
            current.lastError = listOfNotNull(error::class.simpleName, error.message).joinToString(": ").take(240)
            current.nextAttemptAt = now.plus(retryDelaySeconds(current.attemptCount), ChronoUnit.SECONDS)
            current.updatedAt = now
            outbox.save(current)
        }
    }

    private fun retryDelaySeconds(attempt: Int): Long =
        (10L * (1L shl attempt.coerceIn(0, 5))).coerceAtMost(300L)

    private companion object {
        const val PENDING = "PENDING"
        const val COMPLETED = "COMPLETED"
    }
}
