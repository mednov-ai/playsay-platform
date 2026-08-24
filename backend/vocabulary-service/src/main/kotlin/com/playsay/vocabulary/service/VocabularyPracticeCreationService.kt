package com.playsay.vocabulary.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyPracticeResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyPracticeCreationService(
    private val practices: VocabularyPracticeRepo,
    private val planService: VocabularyPracticePlanService,
    private val queryService: VocabularyPracticeQueryService,
    private val liveCoordination: VocabularyLiveCoordinationService,
    private val factory: VocabularyPracticeFactory,
    private val completion: VocabularyPracticeCompletionService,
    private val eventPublisher: VocabularyPracticeEventPublisher,
) {
    fun create(
        actorSubject: String,
        request: VocabularyPracticeSettingsRequest,
        requiredDelivery: PracticeDelivery? = null,
    ): VocabularyPracticeResponse {
        val resolvedPlan = request.planId?.let {
            planService.requireForPublication(actorSubject, it, request.planRevision)
        } ?: planService.preview(actorSubject, request).let {
            planService.requireForPublication(actorSubject, it.planId, it.revision)
        }
        val planRequest = resolvedPlan.payload.request
        if (request.planId != null) requireCompatibleRepeatedSettings(request, planRequest)
        resolvedPlan.entity.publishedPracticeId?.let { publishedPracticeId ->
            val existing = practices.findById(publishedPracticeId).orElseThrow {
                ResponseStatusException(HttpStatus.CONFLICT, "The published vocabulary practice is unavailable.")
            }
            return queryService.responseForActor(actorSubject, existing, queryService.practiceResponse(existing))
        }
        val effectiveRequest = planRequest.copy(
            planId = resolvedPlan.entity.id,
            planRevision = resolvedPlan.entity.revision,
            assignmentId = request.assignmentId ?: planRequest.assignmentId,
            lessonId = request.lessonId ?: planRequest.lessonId,
        )
        val delivery = effectiveRequest.delivery
        val lessonId = effectiveRequest.lessonId
        if (requiredDelivery != null && delivery != requiredDelivery) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice plan delivery does not match the publish endpoint.")
        }
        if (delivery == PracticeDelivery.LIVE && lessonId == null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "lessonId is required for live vocabulary practice.")
        }
        if (resolvedPlan.entity.delivery != delivery) {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Vocabulary practice plan delivery does not match the publish target.",
            )
        }
        if (delivery == PracticeDelivery.LIVE) {
            liveCoordination.requireAvailableLesson(requireNotNull(lessonId))
        }

        val now = Instant.now()
        val effective = EffectiveVocabularyPracticeConfiguration(effectiveRequest, resolvedPlan, lessonId)
        val practice = factory.create(actorSubject, effective, now)
        planService.markPublished(resolvedPlan.entity.id, practice.id)
        completion.completeIfNeeded(practice.id, now)
        val refreshedPractice = practices.findById(practice.id).orElseThrow()
        val response = queryService.practiceResponse(refreshedPractice)
        eventPublisher.publish("vocabulary.practice.started", actorSubject, refreshedPractice, response)
        return queryService.responseForActor(actorSubject, refreshedPractice, response)
    }

    private fun requireCompatibleRepeatedSettings(
        request: VocabularyPracticeSettingsRequest,
        frozen: VocabularyPracticeSettingsRequest,
    ) {
        val defaults = VocabularyPracticeSettingsRequest()
        val conflicts = buildList {
            fun repeated(name: String, supplied: Any?, default: Any?, expected: Any?) {
                if (supplied != default && supplied != expected) add(name)
            }
            repeated("ownerSubjects", request.ownerSubjects, defaults.ownerSubjects, frozen.ownerSubjects)
            repeated("delivery", request.delivery, defaults.delivery, frozen.delivery)
            repeated("mode", request.mode, defaults.mode, frozen.mode)
            repeated("wordLimit", request.wordLimit, defaults.wordLimit, frozen.wordLimit)
            repeated("pinnedEntryIds", request.pinnedEntryIds, defaults.pinnedEntryIds, frozen.pinnedEntryIds)
            repeated("excludedEntryIds", request.excludedEntryIds, defaults.excludedEntryIds, frozen.excludedEntryIds)
            repeated("ownerOverrides", request.ownerOverrides, defaults.ownerOverrides, frozen.ownerOverrides)
            repeated("selection", request.selection, defaults.selection, frozen.selection)
            repeated("recipeId", request.recipeId, defaults.recipeId, frozen.recipeId)
            repeated("materializationKey", request.materializationKey, defaults.materializationKey, frozen.materializationKey)
            repeated("completionPolicy", request.completionPolicy, defaults.completionPolicy, frozen.completionPolicy)
            repeated("completionThresholds", request.completionThresholds, defaults.completionThresholds, frozen.completionThresholds)
            repeated("keyMode", request.keyMode, defaults.keyMode, frozen.keyMode)
            repeated("keyNgramSettings", request.keyNgramSettings, defaults.keyNgramSettings, frozen.keyNgramSettings)
        }
        if (conflicts.isNotEmpty()) {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Published settings conflict with the frozen vocabulary plan: ${conflicts.joinToString()}.",
            )
        }
    }
}
