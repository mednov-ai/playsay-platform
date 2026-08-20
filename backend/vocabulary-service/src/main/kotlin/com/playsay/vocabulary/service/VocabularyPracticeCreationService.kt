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
    fun create(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticeResponse {
        val resolvedPlan = request.planId?.let {
            planService.requireForPublication(actorSubject, it, request.planRevision)
        } ?: planService.preview(actorSubject, request).let {
            planService.requireForPublication(actorSubject, it.planId, it.revision)
        }
        resolvedPlan.entity.publishedPracticeId?.let { publishedPracticeId ->
            val existing = practices.findById(publishedPracticeId).orElseThrow {
                ResponseStatusException(HttpStatus.CONFLICT, "The published vocabulary practice is unavailable.")
            }
            return queryService.responseForActor(actorSubject, existing, queryService.practiceResponse(existing))
        }
        val planRequest = resolvedPlan.payload.request
        val delivery = request.delivery
        val lessonId = request.lessonId ?: planRequest.lessonId
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
        val practice = factory.create(actorSubject, request, resolvedPlan, lessonId, now)
        planService.markPublished(resolvedPlan.entity.id, practice.id)
        completion.completeIfNeeded(practice.id, now)
        val refreshedPractice = practices.findById(practice.id).orElseThrow()
        val response = queryService.practiceResponse(refreshedPractice)
        eventPublisher.publish("vocabulary.practice.started", actorSubject, refreshedPractice, response)
        return queryService.responseForActor(actorSubject, refreshedPractice, response)
    }
}
