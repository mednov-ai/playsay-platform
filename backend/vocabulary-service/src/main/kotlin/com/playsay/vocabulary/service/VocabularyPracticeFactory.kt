package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service

@Service
class VocabularyPracticeFactory(
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val objectMapper: ObjectMapper,
) {
    fun create(
        actorSubject: String,
        request: VocabularyPracticeSettingsRequest,
        resolvedPlan: ResolvedVocabularyPracticePlan,
        lessonId: UUID?,
        now: Instant,
    ): VocabularyPracticeEntity {
        val practice = savePractice(actorSubject, request, resolvedPlan, lessonId, now)
        resolvedPlan.payload.owners.forEach { ownerPlan -> saveSession(practice, ownerPlan, now) }
        return practice
    }

    private fun savePractice(
        actorSubject: String,
        request: VocabularyPracticeSettingsRequest,
        resolvedPlan: ResolvedVocabularyPracticePlan,
        lessonId: UUID?,
        now: Instant,
    ) = practices.save(
        VocabularyPracticeEntity(
            id = UUID.randomUUID(),
            createdBySubject = actorSubject,
            delivery = request.delivery,
            status = if (request.delivery in immediatePracticeDeliveries) PracticeStatus.ACTIVE else PracticeStatus.PUBLISHED,
            lessonId = lessonId,
            assignmentId = request.assignmentId,
            mode = resolvedPlan.entity.mode,
            settingsJson = objectMapper.writeValueAsString(
                request.copy(
                    ownerSubjects = emptyList(),
                    pinnedEntryIds = emptyList(),
                    excludedEntryIds = emptyList(),
                    ownerOverrides = emptyList(),
                    planId = resolvedPlan.entity.id,
                    planRevision = resolvedPlan.entity.revision,
                ),
            ),
            startedAt = if (request.delivery in immediatePracticeDeliveries) now else null,
            createdAt = now,
            updatedAt = now,
        ),
    )

    private fun saveSession(
        practice: VocabularyPracticeEntity,
        ownerPlan: VocabularyPracticePlanOwnerPayload,
        now: Instant,
    ) {
        val session = sessions.save(
            VocabularyPracticeSessionEntity(
                id = UUID.randomUUID(),
                practiceId = practice.id,
                ownerSubject = ownerPlan.ownerSubject,
                status = if (ownerPlan.items.isEmpty()) SessionStatus.COMPLETED else SessionStatus.NOT_STARTED,
                completedAt = if (ownerPlan.items.isEmpty()) now else null,
                createdAt = now,
                updatedAt = now,
            ),
        )
        items.saveAll(
            ownerPlan.items.mapIndexed { position, planned ->
                VocabularyPracticeItemEntity(
                    id = UUID.randomUUID(),
                    sessionId = session.id,
                    entryId = planned.entryId,
                    position = position,
                    skill = planned.skill,
                    exerciseType = planned.type,
                    prompt = planned.prompt,
                    answer = planned.answer,
                    optionsJson = objectMapper.writeValueAsString(planned.options),
                    schemaVersion = 2,
                    acceptedAnswersJson = objectMapper.writeValueAsString(planned.acceptedAnswers),
                    contentJson = objectMapper.writeValueAsString(planned.content),
                    affectsSchedule = planned.affectsSchedule,
                    snapshotJson = objectMapper.writeValueAsString(planned.snapshot),
                    createdAt = now,
                    updatedAt = now,
                )
            },
        )
    }
}

private val immediatePracticeDeliveries = setOf(PracticeDelivery.SELF, PracticeDelivery.LIVE)
