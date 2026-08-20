package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeMode
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyAttemptRequest
import com.playsay.vocabulary.dto.VocabularyAttemptResponse
import com.playsay.vocabulary.dto.VocabularyDashboardResponse
import com.playsay.vocabulary.dto.VocabularyKeySetResponse
import com.playsay.vocabulary.dto.VocabularyKeyAcknowledgementRequest
import com.playsay.vocabulary.dto.VocabularyKeyItemResponse
import com.playsay.vocabulary.dto.VocabularyKeyResultRequest
import com.playsay.vocabulary.dto.VocabularyLearnerSummaryResponse
import com.playsay.vocabulary.dto.VocabularyLearningEntryResponse
import com.playsay.vocabulary.dto.VocabularyPracticeItemResponse
import com.playsay.vocabulary.dto.VocabularyPracticeOwnerPreviewResponse
import com.playsay.vocabulary.dto.VocabularyPracticePreviewResponse
import com.playsay.vocabulary.dto.VocabularyPracticeRevealResponse
import com.playsay.vocabulary.dto.VocabularyPracticeResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSessionSummaryResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularyPracticeStatusRequest
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.dto.VocabularySkillStateResponse
import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationRequest
import com.playsay.vocabulary.dto.VocabularyHomeworkPreparationResponse
import com.playsay.vocabulary.dto.VocabularyHomeworkSessionRef
import com.playsay.vocabulary.dto.VocabularySelectionCriteriaRequest
import com.playsay.vocabulary.dto.VocabularySelectionRecipeRequest
import com.playsay.vocabulary.dto.VocabularySelectionRecipeResponse
import com.playsay.vocabulary.dto.VocabularySelectionSource
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyPracticeAttemptEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.mapper.toResponse
import com.playsay.vocabulary.realtime.VocabularyPracticeChangedEvent
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeAttemptRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import java.text.Normalizer
import java.time.Instant
import java.util.Locale
import java.util.UUID
import kotlin.math.ceil
import org.springframework.context.ApplicationEventPublisher
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyPracticeService(
    private val planService: VocabularyPracticePlanService,
    private val queryService: VocabularyPracticeQueryService,
    private val creationService: VocabularyPracticeCreationService,
    private val selfPracticeService: VocabularySelfPracticeService,
    private val statusService: VocabularyPracticeStatusService,
    private val attemptService: VocabularyPracticeAttemptService,
    private val keyboardService: VocabularyKeyboardPracticeService,
    private val homeworkService: VocabularyHomeworkPracticeService,
    private val recipeService: VocabularySelectionRecipeService,
) {
    @Transactional
    fun dashboard(
        actorSubject: String,
        ownerSubject: String?,
        lessonId: UUID?,
        query: String?,
    ): VocabularyDashboardResponse = queryService.dashboard(actorSubject, ownerSubject, lessonId, query)

    @Transactional(readOnly = true)
    fun learners(actorSubject: String, query: String?): List<VocabularyLearnerSummaryResponse> =
        queryService.learners(actorSubject, query)

    @Transactional
    fun preview(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticePreviewResponse {
        return planService.preview(actorSubject, request)
    }

    @Transactional
    fun recommendedPreview(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticePreviewResponse =
        planService.preview(
            actorSubject,
            request.copy(
                ownerSubjects = listOf(actorSubject),
                delivery = PracticeDelivery.SELF,
                selection = request.selection ?: VocabularySelectionCriteriaRequest(
                    sources = setOf(
                        VocabularySelectionSource.DUE,
                        VocabularySelectionSource.FORGOTTEN,
                        VocabularySelectionSource.DIFFICULT,
                        VocabularySelectionSource.NEW,
                    ),
                ),
            ),
        )

    @Transactional(readOnly = true)
    fun recipes(actorSubject: String): List<VocabularySelectionRecipeResponse> = recipeService.list(actorSubject)

    @Transactional(readOnly = true)
    fun recipe(actorSubject: String, id: UUID): VocabularySelectionRecipeResponse = recipeService.get(actorSubject, id)

    @Transactional
    fun createRecipe(actorSubject: String, request: VocabularySelectionRecipeRequest) = recipeService.create(actorSubject, request)

    @Transactional
    fun updateRecipe(actorSubject: String, id: UUID, request: VocabularySelectionRecipeRequest) =
        recipeService.update(actorSubject, id, request)

    @Transactional
    fun deleteRecipe(actorSubject: String, id: UUID) = recipeService.delete(actorSubject, id)

    @Transactional
    fun create(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticeResponse =
        creationService.create(actorSubject, request)

    @Transactional
    fun createLive(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticeResponse {
        if (request.delivery != PracticeDelivery.LIVE) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only LIVE practice may be created through this endpoint.")
        }
        return create(actorSubject, request)
    }

    @Transactional
    fun selfPractice(
        actorSubject: String,
        request: VocabularyPracticeSettingsRequest,
    ): VocabularyPracticeResponse = selfPracticeService.selfPractice(actorSubject, request)

    @Transactional
    fun prepareHomework(request: VocabularyHomeworkPreparationRequest): VocabularyHomeworkPreparationResponse =
        homeworkService.prepare(request)

    @Transactional
    fun activeForLesson(actorSubject: String, lessonId: UUID): VocabularyPracticeResponse? =
        queryService.activeForLesson(actorSubject, lessonId)

    @Transactional
    fun requirePracticeSubscription(actorSubject: String, practiceId: UUID): VocabularyPracticeResponse =
        queryService.requirePracticeSubscription(actorSubject, practiceId)

    @Transactional
    fun status(
        actorSubject: String,
        practiceId: UUID,
        request: VocabularyPracticeStatusRequest,
    ): VocabularyPracticeResponse = statusService.status(actorSubject, practiceId, request)

    @Scheduled(fixedDelayString = "\${playsay.practice.closed-lesson-check-ms:10000}")
    @Transactional
    fun completeClosedLessonRuns() = statusService.completeClosedLessonRuns()

    @Transactional
    fun session(actorSubject: String, sessionId: UUID): VocabularyPracticeSessionSummaryResponse =
        queryService.session(actorSubject, sessionId)

    @Transactional
    fun history(
        actorSubject: String,
        ownerSubject: String?,
        lessonId: UUID?,
        page: Int = 0,
        size: Int = 25,
    ): List<VocabularyPracticeSessionSummaryResponse> =
        queryService.history(actorSubject, ownerSubject, lessonId, page, size)

    @Transactional
    fun attempt(actorSubject: String, sessionId: UUID, request: VocabularyAttemptRequest): VocabularyAttemptResponse =
        attemptService.attempt(actorSubject, sessionId, request)

    @Transactional
    fun reveal(actorSubject: String, sessionId: UUID, itemId: UUID): VocabularyPracticeRevealResponse =
        attemptService.reveal(actorSubject, sessionId, itemId)

    @Transactional
    fun giveHint(actorSubject: String, sessionId: UUID): VocabularyPracticeSessionSummaryResponse =
        attemptService.giveHint(actorSubject, sessionId)

    @Transactional
    fun requestHelp(actorSubject: String, sessionId: UUID): VocabularyPracticeSessionSummaryResponse =
        attemptService.requestHelp(actorSubject, sessionId)

    @Transactional
    fun keySet(actorSubject: String, sessionId: UUID): VocabularyKeySetResponse =
        keyboardService.keySet(actorSubject, sessionId)

    @Transactional
    fun acknowledgeKeyPosition(actorSubject: String, sessionId: UUID, request: VocabularyKeyAcknowledgementRequest) =
        keyboardService.acknowledgePosition(actorSubject, sessionId, request)

    @Transactional
    fun recordKeyResult(sessionId: UUID, request: VocabularyKeyResultRequest) =
        keyboardService.recordKeyResult(sessionId, request)

    @Transactional
    fun legacyPractice(actorSubject: String, limit: Int) = queryService.legacyPractice(actorSubject, limit)

}
