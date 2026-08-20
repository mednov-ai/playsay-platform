package com.playsay.gateway.service.assignment

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.integration.delivery.exponentialRetryDelay
import com.playsay.gateway.client.VocabularyAssignmentClient
import com.playsay.gateway.dto.VocabularyHomeworkRequest
import com.playsay.gateway.repo.AssignmentIntegrationOutboxRepo
import java.time.Instant
import java.util.UUID
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

data class VocabularyAssignmentOutboxPayload(
    val actorSubject: String,
    val ownerSubjects: List<String>,
    val request: VocabularyHomeworkRequest,
)

@Component
class VocabularyAssignmentOutboxProcessor(
    private val outbox: AssignmentIntegrationOutboxRepo,
    private val client: VocabularyAssignmentClient,
    private val assignments: AssignmentStore,
    private val objectMapper: ObjectMapper,
) {
    @Scheduled(
        fixedDelayString = "\${playsay.vocabulary-assignments.retry-delay-ms:10000}",
        initialDelayString = "\${playsay.vocabulary-assignments.retry-delay-ms:10000}",
    )
    fun processDue() {
        outbox.findTop50ByStatusAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(OUTBOX_PENDING, Instant.now())
            .forEach { event -> processEvent(event.id) }
    }

    fun processAssignment(assignmentId: UUID): Boolean {
        val event = outbox.findByAssignmentIdAndEventType(assignmentId, VOCABULARY_ASSIGNMENT_PREPARE_EVENT)
            ?: return false
        if (event.status == OUTBOX_COMPLETED) return true
        return processEvent(event.id)
    }

    private fun processEvent(eventId: UUID): Boolean {
        val event = outbox.findById(eventId).orElse(null) ?: return false
        if (event.status != OUTBOX_PENDING) return event.status == OUTBOX_COMPLETED
        return runCatching {
            val payload = objectMapper.readValue(event.payload, VocabularyAssignmentOutboxPayload::class.java)
            val response = client.prepare(
                actorSubject = payload.actorSubject,
                assignmentId = event.assignmentId,
                ownerSubjects = payload.ownerSubjects,
                request = payload.request,
            )
            assignments.applyVocabularyPreparation(event.assignmentId, response, payload.actorSubject)
        }.fold(
            onSuccess = { true },
            onFailure = { error ->
                val current = outbox.findById(eventId).orElse(null) ?: return@fold false
                val now = Instant.now()
                current.attemptCount += 1
                current.lastError = listOfNotNull(error::class.simpleName, error.message)
                    .joinToString(": ")
                    .take(240)
                current.nextAttemptAt = now.plus(exponentialRetryDelay(current.attemptCount))
                current.updatedAt = now
                outbox.save(current)
                false
            },
        )
    }

}
