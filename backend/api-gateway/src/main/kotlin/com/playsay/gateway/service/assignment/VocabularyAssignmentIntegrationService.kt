package com.playsay.gateway.service.assignment

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.VocabularyAssignmentPreparationResponse
import com.playsay.gateway.dto.VocabularyAssignmentProgressUpdateRequest
import com.playsay.gateway.dto.VocabularyHomeworkRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.AssignmentIntegrationOutboxEntity
import com.playsay.gateway.entity.AssignmentRecipientEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentIntegrationOutboxRepo
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.utils.MetaData
import com.playsay.integration.delivery.IntegrationDeliveryState
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

@Component
class VocabularyAssignmentIntegrationService(
    private val assignmentRepo: AssignmentRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val assignmentIntegrationOutboxRepo: AssignmentIntegrationOutboxRepo,
    private val appUserRepo: AppUserRepo,
    private val assignmentEventPublisher: AssignmentEventPublisher,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun enqueuePreparation(
        result: VocabularyAssignmentCreationResult,
        actorSubject: String,
        request: VocabularyHomeworkRequest,
    ) {
        val recipients = result.recipients ?: return
        val now = requireNotNull(result.createdAt)
        assignmentIntegrationOutboxRepo.save(
            AssignmentIntegrationOutboxEntity().apply {
                id = UUID.randomUUID()
                assignmentId = result.assignmentId
                eventType = VOCABULARY_ASSIGNMENT_PREPARE_EVENT
                payload = objectMapper.writeValueAsString(
                    VocabularyAssignmentOutboxPayload(
                        actorSubject = actorSubject,
                        ownerSubjects = recipients.map(AppUserEntity::keycloakSubject),
                        request = request,
                    ),
                )
                status = OUTBOX_PENDING
                nextAttemptAt = now
                createdAt = now
                updatedAt = now
            },
        )
    }

    fun applyPreparation(
        assignmentId: UUID,
        response: VocabularyAssignmentPreparationResponse,
        actorSubject: String,
    ) {
        val assignment = assignmentRepo.findById(assignmentId).orElseThrow()
        if (assignment.status == MetaData.AssignmentStatuses.ACTIVE && assignment.activityRef == response.practiceId) {
            completeOutbox(assignmentId)
            return
        }
        val recipients = assignmentRecipientRepo.findByAssignmentIdOrderByCreatedAtAsc(assignmentId)
        val subjectsByUserId = appUserRepo.findByIdIn(recipients.map(AssignmentRecipientEntity::studentUserId))
            .associate { user -> user.id to user.keycloakSubject }
        val sessionsBySubject = response.sessions.associateBy { session -> session.ownerSubject }
        if (recipients.any { recipient -> subjectsByUserId[recipient.studentUserId] !in sessionsBySubject }) {
            error("Vocabulary service did not prepare every assignment recipient")
        }
        val now = Instant.now()
        recipients.forEach { recipient ->
            recipient.activityRef = sessionsBySubject[subjectsByUserId[recipient.studentUserId]]?.sessionId
            recipient.activityState = "NOT_STARTED"
            recipient.updatedAt = now
        }
        assignmentRecipientRepo.saveAll(recipients)
        assignment.activityRef = response.practiceId
        assignment.status = MetaData.AssignmentStatuses.ACTIVE
        assignment.updatedAt = now
        assignmentRepo.save(assignment)
        completeOutbox(assignmentId)
        assignmentEventPublisher.publish(
            assignmentId = assignment.id,
            visibleSubjects = recipients.mapNotNullTo(mutableSetOf()) { recipient -> subjectsByUserId[recipient.studentUserId] }
                .apply { add(actorSubject) },
            change = "CREATED",
        )
    }

    fun updateProgress(assignmentId: UUID, request: VocabularyAssignmentProgressUpdateRequest) {
        val assignment = assignmentRepo.findById(assignmentId).orElseThrow(::assignmentNotFound)
        if (assignment.contentKind != MetaData.AssignmentContentKinds.VOCABULARY_PRACTICE) throw assignmentNotFound()
        val user = appUserRepo.findByKeycloakSubject(request.ownerSubject) ?: throw assignmentNotFound()
        val recipient = assignmentRecipientRepo.findByAssignmentIdAndStudentUserId(assignmentId, user.id)
            ?: throw assignmentNotFound()
        if (recipient.activityRef != request.sessionId || request.revision <= recipient.activityRevision) return
        recipient.activityRevision = request.revision
        recipient.activityState = request.state
        recipient.completionRatio = request.completionRatio
        recipient.accuracy = request.accuracy
        recipient.difficultWordCount = request.difficultWordCount
        recipient.activityUpdatedAt = request.updatedAt
        recipient.updatedAt = Instant.now()
        assignmentRecipientRepo.save(recipient)
        assignment.updatedAt = recipient.updatedAt
        assignmentRepo.save(assignment)
        val teacherSubject = assignment.teacherUserId
            ?.let { teacherUserId -> appUserRepo.findById(teacherUserId).orElse(null)?.keycloakSubject }
        assignmentEventPublisher.publish(
            assignmentId = assignment.id,
            visibleSubjects = listOfNotNull(request.ownerSubject, teacherSubject).toSet(),
            change = "UPDATED",
        )
    }

    private fun completeOutbox(assignmentId: UUID) {
        val event = assignmentIntegrationOutboxRepo.findByAssignmentIdAndEventType(
            assignmentId,
            VOCABULARY_ASSIGNMENT_PREPARE_EVENT,
        ) ?: return
        event.status = OUTBOX_COMPLETED
        event.lastError = null
        event.updatedAt = Instant.now()
        assignmentIntegrationOutboxRepo.save(event)
    }

    private fun assignmentNotFound(): ProjectResponseException =
        ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.ASSIGNMENT_NOT_FOUND)
}

internal const val VOCABULARY_ASSIGNMENT_PREPARE_EVENT = "VOCABULARY_ASSIGNMENT_PREPARE"
internal val OUTBOX_PENDING = IntegrationDeliveryState.PENDING.persistedValue
internal val OUTBOX_COMPLETED = IntegrationDeliveryState.COMPLETED.persistedValue
