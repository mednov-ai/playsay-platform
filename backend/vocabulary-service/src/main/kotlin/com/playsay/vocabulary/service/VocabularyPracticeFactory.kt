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
    private val media: VocabularyMediaService,
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
    ): VocabularyPracticeEntity {
        val practiceId = UUID.randomUUID()
        return practices.save(
        VocabularyPracticeEntity(
            id = practiceId,
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
            completionPolicy = request.completionPolicy,
            completionPolicyVersion = request.completionThresholds.policyVersion,
            completionThresholdsJson = objectMapper.writeValueAsString(request.completionThresholds),
            keyMode = request.keyMode,
            keyNgramSettingsJson = objectMapper.writeValueAsString(request.keyNgramSettings),
            keyMaterializerVersion = KEY_MATERIALIZER_VERSION,
            keyMaterializerSeed = practiceId.mostSignificantBits xor practiceId.leastSignificantBits,
            startedAt = if (request.delivery in immediatePracticeDeliveries) now else null,
            createdAt = now,
            updatedAt = now,
        ),
    )
    }

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
        val savedItems = items.saveAll(
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
                    lexicalContentRevisionId = planned.lexicalContentRevisionId,
                    snapshotJson = objectMapper.writeValueAsString(planned.snapshot),
                    createdAt = now,
                    updatedAt = now,
                )
            },
        )
        savedItems.forEach { item -> item.entryId?.let { media.pinApprovedAsset(it, item.id) } }
    }
}

private const val KEY_MATERIALIZER_VERSION = "vocabulary-key-v1"

private val immediatePracticeDeliveries = setOf(PracticeDelivery.SELF, PracticeDelivery.LIVE)
