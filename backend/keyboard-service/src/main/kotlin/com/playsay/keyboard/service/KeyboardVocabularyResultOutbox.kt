package com.playsay.keyboard.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.integration.delivery.IntegrationDeliveryState
import com.playsay.integration.delivery.exponentialRetryDelay
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.entity.KeyboardVocabularyResultOutboxEntity
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.repo.KeyboardVocabularyResultOutboxRepo
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

data class KeyboardVocabularyResultPayload(
    val clientResultId: String,
    val attempts: List<KeyboardVocabularyWordAttemptPayload>,
)

data class KeyboardVocabularyWordAttemptPayload(
    val itemId: UUID,
    val entryId: UUID,
    val errors: Int,
)

@Component
class KeyboardVocabularyResultOutbox(
    private val outbox: KeyboardVocabularyResultOutboxRepo,
    @param:Value("\${playsay.vocabulary-integration.base-url:http://vocabulary-service.playsay-dev.svc.cluster.local}")
    private val vocabularyBaseUrl: String,
    @param:Value("\${playsay.user-data.service-token:}")
    private val serviceToken: String,
) {
    private val httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build()

    fun enqueue(result: TrainingResultEntity, request: SubmitResultRequest) {
        if (request.practiceContext["practiceKind"] != "VOCABULARY") return
        if (outbox.existsByTrainingResultId(result.id)) return
        val sessionId = request.practiceContext.uuid("vocabularySessionId") ?: return
        val itemIds = request.practiceContext.uuidList("vocabularyItemIds")
        val entryIds = request.practiceContext.uuidList("vocabularyEntryIds")
        val words = request.practiceContext.stringList("vocabularyWords")
        if (itemIds.size != entryIds.size || itemIds.size != words.size || itemIds.isEmpty()) return
        val attempts = itemIds.indices.map { index ->
            KeyboardVocabularyWordAttemptPayload(
                itemId = itemIds[index],
                entryId = entryIds[index],
                errors = (request.perChord[words[index]] ?: 0).coerceIn(0, MAX_ERRORS),
            )
        }
        val now = Instant.now()
        val clientResultId = result.clientResultId ?: "keyboard-result-${result.id}"
        outbox.save(
            KeyboardVocabularyResultOutboxEntity().apply {
                id = UUID.randomUUID()
                trainingResultId = result.id
                this.sessionId = sessionId
                payload = objectMapper.writeValueAsString(KeyboardVocabularyResultPayload(clientResultId, attempts))
                status = PENDING
                nextAttemptAt = now
                createdAt = now
                updatedAt = now
            },
        )
    }

    @Scheduled(
        fixedDelayString = "\${playsay.vocabulary-integration.retry-delay-ms:10000}",
        initialDelayString = "\${playsay.vocabulary-integration.retry-delay-ms:10000}",
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
                    vocabularyBaseUrl.trimEnd('/') +
                        "/internal/vocabulary/practice-sessions/${event.sessionId}/key-results",
                ),
            )
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .header("X-PlaySay-Service-Token", serviceToken)
                .POST(HttpRequest.BodyPublishers.ofString(event.payload))
                .build()
            val response = httpClient.send(request, HttpResponse.BodyHandlers.discarding())
            check(response.statusCode() in 200..299) {
                "Vocabulary result callback failed with HTTP ${response.statusCode()}"
            }
        }.onSuccess {
            outbox.deleteById(eventId)
        }.onFailure { error ->
            val current = outbox.findById(eventId).orElse(null) ?: return@onFailure
            val now = Instant.now()
            current.attemptCount += 1
            current.lastError = listOfNotNull(error::class.simpleName, error.message).joinToString(": ").take(240)
            current.nextAttemptAt = now.plus(exponentialRetryDelay(current.attemptCount))
            current.updatedAt = now
            outbox.save(current)
        }
    }

    private fun Map<String, Any?>.uuid(key: String): UUID? =
        (this[key] as? String)?.let { value -> runCatching { UUID.fromString(value) }.getOrNull() }

    private fun Map<String, Any?>.uuidList(key: String): List<UUID> =
        stringList(key).mapNotNull { value -> runCatching { UUID.fromString(value) }.getOrNull() }

    private fun Map<String, Any?>.stringList(key: String): List<String> =
        (this[key] as? List<*>)
            ?.mapNotNull { value -> (value as? String)?.takeIf(String::isNotBlank) }
            ?.take(100)
            .orEmpty()

    private companion object {
        val objectMapper = jacksonObjectMapper()
        val PENDING = IntegrationDeliveryState.PENDING.persistedValue
        const val MAX_ERRORS = 999
    }
}
