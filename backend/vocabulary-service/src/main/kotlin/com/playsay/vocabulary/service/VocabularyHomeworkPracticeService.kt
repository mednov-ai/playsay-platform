package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationRequest
import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationResponse
import com.playsay.vocabulary.dto.VocabularyHomeworkSessionRef
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import com.playsay.vocabulary.util.cleanVocabularySubject
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyHomeworkPracticeService(
    private val access: VocabularyAccessService,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val creationService: VocabularyPracticeCreationService,
    private val queryService: VocabularyPracticeQueryService,
    private val completion: VocabularyPracticeCompletionService,
    private val objectMapper: ObjectMapper,
) {
    fun prepare(request: VocabularyHomeworkPreparationRequest): VocabularyHomeworkPreparationResponse {
        practices.findByAssignmentId(request.assignmentId)?.let { existing ->
            return queryService.homeworkPreparationResponse(existing)
        }
        request.sourcePracticeId?.let { sourcePracticeId ->
            return cloneRemaining(request, sourcePracticeId)
        }
        if (request.ownerSubjects.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one vocabulary owner is required.")
        }
        val practice = creationService.create(
            request.actorSubject,
            VocabularyPracticeSettingsRequest(
                ownerSubjects = request.ownerSubjects,
                delivery = PracticeDelivery.HOMEWORK,
                mode = request.mode,
                assignmentId = request.assignmentId,
                wordLimit = request.wordLimit,
                pinnedEntryIds = request.pinnedEntryIds,
                excludedEntryIds = request.excludedEntryIds,
                planId = request.planId,
                planRevision = request.planRevision,
                completionPolicy = request.completionPolicy,
                completionThresholds = request.completionThresholds,
                keyMode = request.keyMode,
                keyNgramSettings = request.keyNgramSettings,
            ),
        )
        return VocabularyHomeworkPreparationResponse(
            practiceId = practice.id,
            sessions = practice.sessions.map { VocabularyHomeworkSessionRef(it.id, it.ownerSubject) },
        )
    }

    private fun cloneRemaining(
        request: VocabularyHomeworkPreparationRequest,
        sourcePracticeId: UUID,
    ): VocabularyHomeworkPreparationResponse {
        val context = requireCloneContext(request, sourcePracticeId)
        val now = Instant.now()
        val homework = saveHomework(request, context.source, now)
        context.ownerSubjects.forEach { owner ->
            cloneOwner(homework, owner, requireNotNull(context.sourceSessions[owner]), now)
        }
        completion.completeIfNeeded(homework.id, now)
        return queryService.homeworkPreparationResponse(homework)
    }

    private fun requireCloneContext(
        request: VocabularyHomeworkPreparationRequest,
        sourcePracticeId: UUID,
    ): HomeworkCloneContext {
        val source = practices.findById(sourcePracticeId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Live vocabulary practice was not found.")
        }
        if (
            source.createdBySubject != request.actorSubject ||
            source.delivery != PracticeDelivery.LIVE ||
            source.status !in setOf(PracticeStatus.COMPLETED, PracticeStatus.CANCELLED)
        ) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        val ownerSubjects = request.ownerSubjects.mapNotNull(::cleanVocabularySubject).distinct()
        if (ownerSubjects.isEmpty()) throw ResponseStatusException(HttpStatus.BAD_REQUEST)
        ownerSubjects.forEach { owner -> access.requireOwnerAccess(request.actorSubject, owner, source.lessonId) }
        val sourceSessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(source.id)
            .associateBy(VocabularyPracticeSessionEntity::ownerSubject)
        if (ownerSubjects.any { it !in sourceSessions }) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "The learner did not participate in this practice.")
        }
        return HomeworkCloneContext(source, ownerSubjects, sourceSessions)
    }

    private fun saveHomework(
        request: VocabularyHomeworkPreparationRequest,
        source: VocabularyPracticeEntity,
        now: Instant,
    ) = practices.save(
            VocabularyPracticeEntity(
                id = UUID.randomUUID(),
                createdBySubject = request.actorSubject,
                delivery = PracticeDelivery.HOMEWORK,
                status = PracticeStatus.PUBLISHED,
                assignmentId = request.assignmentId,
                mode = source.mode,
                settingsJson = objectMapper.writeValueAsString(mapOf("sourcePracticeId" to source.id.toString())),
                completionPolicy = request.completionPolicy,
                completionPolicyVersion = request.completionThresholds.policyVersion,
                completionThresholdsJson = objectMapper.writeValueAsString(request.completionThresholds),
                keyMode = source.keyMode,
                keyNgramSettingsJson = source.keyNgramSettingsJson,
                keyMaterializerVersion = source.keyMaterializerVersion,
                keyMaterializerSeed = source.keyMaterializerSeed,
                createdAt = now,
                updatedAt = now,
            ),
        )

    private fun cloneOwner(
        homework: VocabularyPracticeEntity,
        owner: String,
        sourceSession: VocabularyPracticeSessionEntity,
        now: Instant,
    ) {
        val remaining = items.findAllBySessionIdOrderByPositionAsc(sourceSession.id)
            .filter { it.completedAt == null }
        val homeworkSession = sessions.save(
                VocabularyPracticeSessionEntity(
                    id = UUID.randomUUID(),
                    practiceId = homework.id,
                    ownerSubject = owner,
                    status = if (remaining.isEmpty()) SessionStatus.COMPLETED else SessionStatus.NOT_STARTED,
                    completedAt = if (remaining.isEmpty()) now else null,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
        items.saveAll(
            remaining.mapIndexed { position, sourceItem ->
                VocabularyPracticeItemEntity(
                        id = UUID.randomUUID(),
                        sessionId = homeworkSession.id,
                        entryId = sourceItem.entryId,
                        position = position,
                        skill = sourceItem.skill,
                        exerciseType = sourceItem.exerciseType,
                        prompt = sourceItem.prompt,
                        answer = sourceItem.answer,
                        optionsJson = sourceItem.optionsJson,
                        schemaVersion = sourceItem.schemaVersion,
                        acceptedAnswersJson = sourceItem.acceptedAnswersJson,
                        contentJson = sourceItem.contentJson,
                        affectsSchedule = sourceItem.affectsSchedule,
                        snapshotJson = sourceItem.snapshotJson,
                        createdAt = now,
                        updatedAt = now,
                )
            },
        )
    }
}

private data class HomeworkCloneContext(
    val source: VocabularyPracticeEntity,
    val ownerSubjects: List<String>,
    val sourceSessions: Map<String, VocabularyPracticeSessionEntity>,
)
