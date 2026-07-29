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
    private val entries: VocabularyEntryRepo,
    private val users: VocabularyUserRepo,
    private val access: VocabularyAccessService,
    private val skillStates: VocabularySkillStateRepo,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    private val planService: VocabularyPracticePlanService,
    private val grading: VocabularySessionGradingService,
    private val liveCoordination: VocabularyLiveCoordinationService,
    private val objectMapper: ObjectMapper,
    private val events: ApplicationEventPublisher,
    private val assignmentProgress: VocabularyAssignmentProgressOutbox,
) {
    @Transactional
    fun dashboard(
        actorSubject: String,
        ownerSubject: String?,
        lessonId: UUID?,
        query: String?,
    ): VocabularyDashboardResponse {
        val owner = access.requireOwnerAccess(actorSubject, ownerSubject.cleanSubject() ?: actorSubject, lessonId)
        val activeEntries = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(owner, EntryStatus.ACTIVE)
        val statesByEntry = ensureStates(activeEntries).groupBy(VocabularySkillStateEntity::entryId)
        return dashboardResponse(owner, activeEntries, statesByEntry, query)
    }

    @Transactional(readOnly = true)
    fun learners(actorSubject: String, query: String?): List<VocabularyLearnerSummaryResponse> {
        val normalizedQuery = query?.trim()?.lowercase(Locale.ROOT).orEmpty()
        val manageable = access.manageableLearners(actorSubject)
            .filter { learner ->
                normalizedQuery.isEmpty() ||
                    learner.displayLabel().lowercase(Locale.ROOT).contains(normalizedQuery) ||
                    learner.username?.lowercase(Locale.ROOT)?.contains(normalizedQuery) == true
            }
        if (manageable.isEmpty()) return emptyList()
        val ownerEntries = entries.findAllByOwnerSubjectInAndStatus(
            manageable.map { it.keycloakSubject },
            EntryStatus.ACTIVE,
        )
        val statesByEntry = skillStates.findAllByEntryIdIn(ownerEntries.map { it.id })
            .groupBy(VocabularySkillStateEntity::entryId)
        val entriesByOwner = ownerEntries.groupBy(VocabularyEntryEntity::ownerSubject)
        return manageable
            .asSequence()
            .map { learner ->
                val learnerEntries = entriesByOwner[learner.keycloakSubject].orEmpty()
                val dashboard = dashboardResponse(learner.keycloakSubject, learnerEntries, statesByEntry, null)
                VocabularyLearnerSummaryResponse(
                    ownerSubject = dashboard.ownerSubject,
                    ownerName = dashboard.ownerName ?: learner.displayLabel(),
                    ownerUsername = learner.username,
                    totalCount = dashboard.totalCount,
                    dueCount = dashboard.dueCount,
                    learningCount = dashboard.learningCount,
                    masteredCount = dashboard.masteredCount,
                    needsTranslationCount = dashboard.needsTranslationCount,
                    difficultCount = dashboard.difficultCount,
                    lastPracticedAt = dashboard.lastPracticedAt,
                )
            }
            .toList()
    }

    @Transactional
    fun preview(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticePreviewResponse {
        return planService.preview(actorSubject, request)
    }

    @Transactional
    fun create(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticeResponse {
        val resolvedPlan = request.planId?.let { planService.requireForPublication(actorSubject, it, request.planRevision) }
            ?: planService.preview(actorSubject, request).let { planService.requireForPublication(actorSubject, it.planId, it.revision) }
        resolvedPlan.entity.publishedPracticeId?.let { publishedPracticeId ->
            val existing = practices.findById(publishedPracticeId).orElseThrow {
                ResponseStatusException(HttpStatus.CONFLICT, "The published vocabulary practice is unavailable.")
            }
            return responseForActor(actorSubject, existing, practiceResponse(existing))
        }
        val planRequest = resolvedPlan.payload.request
        val delivery = request.delivery
        val lessonId = request.lessonId ?: planRequest.lessonId
        if (delivery == PracticeDelivery.LIVE && lessonId == null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "lessonId is required for live vocabulary practice.")
        }
        if (resolvedPlan.entity.delivery != delivery) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice plan delivery does not match the publish target.")
        }
        if (delivery == PracticeDelivery.LIVE) {
            liveCoordination.requireAvailableLesson(requireNotNull(lessonId))
        }

        val now = Instant.now()
        val practice = practices.save(
            VocabularyPracticeEntity(
                id = UUID.randomUUID(),
                createdBySubject = actorSubject,
                delivery = delivery,
                status = if (delivery in setOf(PracticeDelivery.SELF, PracticeDelivery.LIVE)) PracticeStatus.ACTIVE else PracticeStatus.PUBLISHED,
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
                startedAt = if (delivery in setOf(PracticeDelivery.SELF, PracticeDelivery.LIVE)) now else null,
                createdAt = now,
                updatedAt = now,
            ),
        )

        resolvedPlan.payload.owners.forEach { ownerPlan ->
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
        planService.markPublished(resolvedPlan.entity.id, practice.id)
        completePracticeIfNeeded(practice.id, now)
        val refreshedPractice = practices.findById(practice.id).orElseThrow()
        val response = practiceResponse(refreshedPractice)
        publish("vocabulary.practice.started", actorSubject, refreshedPractice, response)
        return responseForActor(actorSubject, refreshedPractice, response)
    }

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
    ): VocabularyPracticeResponse {
        sessions.findFirstByOwnerSubjectAndStatusInOrderByUpdatedAtDesc(
            actorSubject,
            setOf(SessionStatus.NOT_STARTED, SessionStatus.IN_PROGRESS, SessionStatus.PAUSED),
        )?.let { activeSession ->
            val activePractice = practices.findById(activeSession.practiceId).orElse(null)
            if (activePractice != null && activePractice.status !in setOf(PracticeStatus.CANCELLED, PracticeStatus.FAILED)) {
                if (activePractice.delivery == PracticeDelivery.SELF) {
                    return responseForActor(actorSubject, activePractice, practiceResponse(activePractice))
                }
                if (activePractice.delivery == PracticeDelivery.HOMEWORK) {
                    val ownerEntries = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(actorSubject, EntryStatus.ACTIVE)
                    val statesByEntry = ensureStates(ownerEntries).groupBy(VocabularySkillStateEntity::entryId)
                    val todayEntryIds = selectEntries(ownerEntries, statesByEntry, request).mapTo(mutableSetOf()) { it.id }
                    val homeworkEntryIds = items.findAllBySessionIdOrderByPositionAsc(activeSession.id)
                        .mapNotNullTo(mutableSetOf(), VocabularyPracticeItemEntity::entryId)
                    if (todayEntryIds.isNotEmpty() && homeworkEntryIds.containsAll(todayEntryIds)) {
                        return responseForActor(actorSubject, activePractice, practiceResponse(activePractice))
                    }
                }
            }
        }
        return create(
            actorSubject,
            request.copy(
                ownerSubjects = listOf(actorSubject),
                delivery = PracticeDelivery.SELF,
                lessonId = null,
                assignmentId = null,
            ),
        )
    }

    @Transactional
    fun prepareHomework(request: VocabularyHomeworkPreparationRequest): VocabularyHomeworkPreparationResponse {
        practices.findByAssignmentId(request.assignmentId)?.let { existing ->
            return existing.toHomeworkPreparationResponse()
        }
        request.sourcePracticeId?.let {
            return cloneRemainingHomework(request, it)
        }
        if (request.ownerSubjects.isEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one vocabulary owner is required.")
        }
        val practice = create(
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
            ),
        )
        return VocabularyHomeworkPreparationResponse(
            practiceId = practice.id,
            sessions = practice.sessions.map { VocabularyHomeworkSessionRef(it.id, it.ownerSubject) },
        )
    }

    @Transactional
    fun activeForLesson(actorSubject: String, lessonId: UUID): VocabularyPracticeResponse? {
        val practice = practices.findFirstByLessonIdAndStatusInOrderByUpdatedAtDesc(lessonId, activePracticeStatuses)
            ?: return null
        requirePracticeAccess(actorSubject, practice)
        return responseForActor(actorSubject, practice, practiceResponse(practice))
    }

    @Transactional
    fun requirePracticeSubscription(actorSubject: String, practiceId: UUID): VocabularyPracticeResponse {
        val practice = practices.findById(practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        requirePracticeAccess(actorSubject, practice)
        return responseForActor(actorSubject, practice, practiceResponse(practice))
    }

    @Transactional
    fun status(
        actorSubject: String,
        practiceId: UUID,
        request: VocabularyPracticeStatusRequest,
    ): VocabularyPracticeResponse {
        val transition = liveCoordination.transition(actorSubject, practiceId, request.status)
        val practice = transition.practice
        practice.assignmentId?.let { assignmentId ->
            transition.sessions.forEach { session -> enqueueAssignmentProgress(assignmentId, session) }
        }
        val response = practiceResponse(practice)
        val eventType = when (request.status) {
            PracticeStatus.PAUSED -> "vocabulary.practice.paused"
            PracticeStatus.COMPLETED, PracticeStatus.CANCELLED -> "vocabulary.practice.completed"
            else -> "vocabulary.practice.started"
        }
        publish(eventType, actorSubject, practice, response)
        return response
    }

    @Scheduled(fixedDelayString = "\${playsay.practice.closed-lesson-check-ms:10000}")
    @Transactional
    fun completeClosedLessonRuns() {
        liveCoordination.closedLessonRuns().forEach { practice ->
            status(
                practice.createdBySubject,
                practice.id,
                VocabularyPracticeStatusRequest(PracticeStatus.COMPLETED),
            )
        }
    }

    @Transactional
    fun session(actorSubject: String, sessionId: UUID): VocabularyPracticeSessionSummaryResponse {
        val session = sessionEntity(sessionId)
        requireSessionAccess(actorSubject, session)
        return sessionResponse(session)
    }

    @Transactional
    fun history(
        actorSubject: String,
        ownerSubject: String?,
        lessonId: UUID?,
        page: Int = 0,
        size: Int = 25,
    ): List<VocabularyPracticeSessionSummaryResponse> {
        val owner = access.requireOwnerAccess(actorSubject, ownerSubject.cleanSubject() ?: actorSubject, lessonId)
        val pageSessions = sessions.findAllByOwnerSubjectOrderByUpdatedAtDesc(
            owner,
            PageRequest.of(page.coerceAtLeast(0), size.coerceIn(1, 50)),
        )
        val sessionItems = items.findAllBySessionIdInOrderBySessionIdAscPositionAsc(pageSessions.map { it.id })
            .groupBy(VocabularyPracticeItemEntity::sessionId)
        val practiceById = practices.findAllById(pageSessions.map { it.practiceId }).associateBy(VocabularyPracticeEntity::id)
        val ownerName = users.findByKeycloakSubject(owner)?.displayLabel()
        return pageSessions.map { session ->
            sessionResponse(
                session = session,
                prefetchedItems = sessionItems[session.id].orEmpty(),
                prefetchedOwnerName = ownerName,
                prefetchedPractice = practiceById[session.practiceId],
            )
        }
    }

    @Transactional
    fun attempt(actorSubject: String, sessionId: UUID, request: VocabularyAttemptRequest): VocabularyAttemptResponse {
        val session = sessionEntityForUpdate(sessionId)
        if (actorSubject != session.ownerSubject) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val parentPractice = practices.findById(session.practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (parentPractice.status == PracticeStatus.PAUSED) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice is paused.")
        }
        if (parentPractice.status in terminalPracticeStatuses || session.status in terminalSessionStatuses) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice is already complete.")
        }
        attempts.findByOwnerSubjectAndClientAttemptId(session.ownerSubject, request.clientAttemptId)?.let { existing ->
            val existingItem = items.findByIdAndSessionId(existing.itemId, session.id)
                ?: throw ResponseStatusException(HttpStatus.CONFLICT, "The previous vocabulary attempt is no longer available.")
            return VocabularyAttemptResponse(existing.id, existing.rating, existing.correct, existingItem.answer, sessionResponse(session))
        }
        if (request.sessionRevision != session.revision) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice has changed; reload the current item.")
        }
        val item = items.findByIdAndSessionId(request.itemId, session.id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val current = currentItem(session, items.findAllBySessionIdOrderByPositionAsc(session.id))
        if (current?.id != item.id) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "This is not the current vocabulary item.")
        }

        val now = Instant.now()
        val gradingDecision = grading.grade(item, request)
        val rating = gradingDecision.rating
        val correct = gradingDecision.correct
        val scheduleCreditApplied = item.affectsSchedule &&
            item.entryId?.let { entryId -> !attempts.hasScheduleCredit(session.id, entryId, item.skill) } == true
        val attempt = attempts.save(
            VocabularyPracticeAttemptEntity(
                id = UUID.randomUUID(),
                sessionId = session.id,
                itemId = item.id,
                ownerSubject = session.ownerSubject,
                clientAttemptId = request.clientAttemptId.trim(),
                rating = rating,
                answerText = request.answer?.take(2_000),
                correct = correct,
                hintsUsed = request.hintsUsed.coerceIn(0, 100),
                durationMs = request.durationMs.coerceIn(0, 3_600_000),
                scheduleCreditApplied = scheduleCreditApplied,
                createdAt = now,
            ),
        )

        session.attemptSequence += 1
        session.attemptCount += 1
        session.revision += 1
        session.updatedAt = now
        session.teacherHint = null
        session.helpRequested = false
        if (session.startedAt == null) session.startedAt = now
        if (session.status in setOf(SessionStatus.NOT_STARTED, SessionStatus.PAUSED)) session.status = SessionStatus.IN_PROGRESS
        if (correct) session.correctCount += 1

        item.attemptCount += 1
        item.updatedAt = now
        if (rating == PracticeRating.AGAIN) {
            val otherPendingCount = items.findAllBySessionIdOrderByPositionAsc(session.id)
                .count { candidate -> candidate.id != item.id && candidate.completedAt == null }
            if (otherPendingCount >= 3) {
                item.retryAfterSequence = session.attemptSequence + 3
            } else {
                // A short session cannot satisfy the retry distance. The scheduler has
                // already returned the skill for tomorrow, so finish this item instead
                // of showing an immediate failure loop.
                item.completedAt = now
            }
        } else {
            item.completedAt = now
        }
        items.save(item)

        if (scheduleCreditApplied) item.entryId?.let { entryId ->
            val state = skillStates.findByEntryIdAndSkill(entryId, item.skill)
                ?: VocabularySkillStateEntity(
                    entryId = entryId,
                    ownerSubject = session.ownerSubject,
                    skill = item.skill,
                    dueAt = now,
                    createdAt = now,
                    updatedAt = now,
                )
            applyPracticeRating(state, rating, now)
            skillStates.save(state)
        }

        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        val next = currentItem(session, sessionItems)
        if (next == null || sessionItems.all { it.completedAt != null }) {
            session.status = SessionStatus.COMPLETED
            session.completedAt = now
        } else {
            session.currentItemPosition = next.position
        }
        sessions.save(session)
        completePracticeIfNeeded(session.practiceId, now)

        val response = sessionResponse(session)
        val practice = practices.findById(session.practiceId).orElseThrow()
        practice.assignmentId?.let { assignmentId -> enqueueAssignmentProgress(assignmentId, session) }
        publish("vocabulary.attempt.recorded", actorSubject, practice, practiceResponse(practice), session.id)
        return VocabularyAttemptResponse(attempt.id, rating, correct, item.answer, response)
    }

    @Transactional(readOnly = true)
    fun reveal(actorSubject: String, sessionId: UUID, itemId: UUID): VocabularyPracticeRevealResponse {
        val session = sessions.findById(sessionId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (actorSubject != session.ownerSubject) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        if (session.status in terminalSessionStatuses) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice is already complete.")
        }
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        val item = items.findByIdAndSessionId(itemId, session.id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (currentItem(session, sessionItems)?.id != item.id || item.exerciseType != PracticeExerciseType.FLASHCARD) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Only the current flashcard can be revealed.")
        }
        return VocabularyPracticeRevealResponse(item.id, item.answer)
    }

    @Transactional
    fun giveHint(actorSubject: String, sessionId: UUID): VocabularyPracticeSessionSummaryResponse {
        val session = sessionEntityForUpdate(sessionId)
        val practice = practices.findById(session.practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (practice.createdBySubject != actorSubject || practice.delivery != PracticeDelivery.LIVE) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        val current = currentItem(session, items.findAllBySessionIdOrderByPositionAsc(session.id))
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "There is no current vocabulary item.")
        session.teacherHint = maskedHint(current.answer)
        session.helpRequested = false
        session.revision += 1
        session.updatedAt = Instant.now()
        sessions.save(session)
        val response = practiceResponse(practice)
        publish("vocabulary.session.updated", actorSubject, practice, response, session.id)
        return sessionResponse(session)
    }

    @Transactional
    fun requestHelp(actorSubject: String, sessionId: UUID): VocabularyPracticeSessionSummaryResponse {
        val session = sessionEntityForUpdate(sessionId)
        val practice = practices.findById(session.practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (
            practice.delivery != PracticeDelivery.LIVE ||
            actorSubject != session.ownerSubject ||
            practice.status !in setOf(PracticeStatus.PUBLISHED, PracticeStatus.ACTIVE) ||
            session.status in terminalSessionStatuses
        ) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        session.helpRequested = true
        session.revision += 1
        session.updatedAt = Instant.now()
        sessions.save(session)
        val response = practiceResponse(practice)
        publish("vocabulary.session.updated", actorSubject, practice, response, session.id)
        return sessionResponse(session)
    }

    @Transactional
    fun keySet(actorSubject: String, sessionId: UUID): VocabularyKeySetResponse {
        val session = sessionEntity(sessionId)
        if (actorSubject != session.ownerSubject) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val keyItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
            .filter { it.entryId != null && it.skill == VocabularySkill.SPELLING }
        val entryIds = keyItems.mapNotNull(VocabularyPracticeItemEntity::entryId).distinct()
        val sessionEntries = entries.findAllById(entryIds)
        return VocabularyKeySetResponse(
            sessionId = session.id,
            title = users.findByKeycloakSubject(session.ownerSubject)?.displayLabel() ?: "Vocabulary",
            entries = sessionEntries.map { it.toResponse() },
            items = keyItems.mapNotNull { item ->
                val entryId = item.entryId ?: return@mapNotNull null
                val sourceText = item.snapshot()["sourceText"]?.takeIf(String::isNotBlank)
                    ?: item.answer.takeIf(String::isNotBlank)
                    ?: return@mapNotNull null
                VocabularyKeyItemResponse(item.id, entryId, sourceText)
            },
        )
    }

    @Transactional
    fun recordKeyResult(sessionId: UUID, request: VocabularyKeyResultRequest) {
        val session = sessionEntityForUpdate(sessionId)
        val practice = practices.findById(session.practiceId).orElseThrow()
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id).associateBy(VocabularyPracticeItemEntity::id)
        val now = Instant.now()
        var changed = false
        request.attempts.distinctBy { it.itemId }.forEach { keyAttempt ->
            val item = sessionItems[keyAttempt.itemId] ?: return@forEach
            if (item.entryId != keyAttempt.entryId || item.skill != VocabularySkill.SPELLING) return@forEach
            val clientAttemptId = "key:${request.clientResultId}:${item.id}".take(128)
            if (attempts.findByOwnerSubjectAndClientAttemptId(session.ownerSubject, clientAttemptId) != null) return@forEach
            val rating = if (keyAttempt.errors <= 0) PracticeRating.GOOD else PracticeRating.AGAIN
            val scheduleCreditApplied = !attempts.hasScheduleCredit(
                session.id,
                keyAttempt.entryId,
                VocabularySkill.SPELLING,
            )
            attempts.save(
                VocabularyPracticeAttemptEntity(
                    id = UUID.randomUUID(),
                    sessionId = session.id,
                    itemId = item.id,
                    ownerSubject = session.ownerSubject,
                    clientAttemptId = clientAttemptId,
                    rating = rating,
                    correct = rating == PracticeRating.GOOD,
                    scheduleCreditApplied = scheduleCreditApplied,
                    createdAt = now,
                ),
            )
            if (scheduleCreditApplied) {
                val state = skillStates.findByEntryIdAndSkill(keyAttempt.entryId, VocabularySkill.SPELLING)
                    ?: VocabularySkillStateEntity(
                        entryId = keyAttempt.entryId,
                        ownerSubject = session.ownerSubject,
                        skill = VocabularySkill.SPELLING,
                        dueAt = now,
                        createdAt = now,
                        updatedAt = now,
                    )
                applyPracticeRating(state, rating, now)
                skillStates.save(state)
            }
            item.attemptCount += 1
            item.completedAt = now
            item.updatedAt = now
            items.save(item)
            session.attemptCount += 1
            if (rating == PracticeRating.GOOD) session.correctCount += 1
            changed = true
        }
        if (!changed) return
        session.revision += 1
        session.updatedAt = now
        if (session.startedAt == null) session.startedAt = now
        val refreshedItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        if (refreshedItems.all { it.completedAt != null }) {
            session.status = SessionStatus.COMPLETED
            session.completedAt = now
        } else if (practice.status in terminalPracticeStatuses) {
            session.status = SessionStatus.COMPLETED
        } else if (practice.status == PracticeStatus.PAUSED) {
            session.status = SessionStatus.PAUSED
        } else {
            session.status = SessionStatus.IN_PROGRESS
        }
        sessions.save(session)
        completePracticeIfNeeded(session.practiceId, now)
        practice.assignmentId?.let { assignmentId -> enqueueAssignmentProgress(assignmentId, session) }
        val refreshedPractice = practices.findById(session.practiceId).orElseThrow()
        publish(
            "vocabulary.attempt.recorded",
            session.ownerSubject,
            refreshedPractice,
            practiceResponse(refreshedPractice),
            session.id,
        )
    }

    @Transactional
    fun legacyPractice(actorSubject: String, limit: Int) =
        selectEntries(
            entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(actorSubject, EntryStatus.ACTIVE),
            ensureStates(entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(actorSubject, EntryStatus.ACTIVE))
                .groupBy(VocabularySkillStateEntity::entryId),
            VocabularyPracticeSettingsRequest(wordLimit = limit.coerceIn(1, 100)),
        ).map { it.toResponse() }

    private fun ensureStates(ownerEntries: List<VocabularyEntryEntity>): List<VocabularySkillStateEntity> {
        if (ownerEntries.isEmpty()) return emptyList()
        val existing = skillStates.findAllByEntryIdIn(ownerEntries.map(VocabularyEntryEntity::id))
        val existingKeys = existing.mapTo(mutableSetOf()) { it.entryId to it.skill }
        val now = Instant.now()
        val missing = ownerEntries.flatMap { entry ->
            VocabularySkill.entries.mapNotNull { skill ->
                if ((entry.id to skill) in existingKeys) {
                    null
                } else {
                    VocabularySkillStateEntity(
                        id = UUID.randomUUID(),
                        entryId = entry.id,
                        ownerSubject = entry.ownerSubject,
                        skill = skill,
                        stage = LearningStage.NEW,
                        intervalIndex = 0,
                        dueAt = now,
                        createdAt = now,
                        updatedAt = now,
                    )
                }
            }
        }
        return existing + skillStates.saveAll(missing)
    }

    private fun dashboardResponse(
        owner: String,
        ownerEntries: List<VocabularyEntryEntity>,
        statesByEntry: Map<UUID, List<VocabularySkillStateEntity>>,
        query: String?,
    ): VocabularyDashboardResponse {
        val now = Instant.now()
        val normalizedQuery = query?.trim()?.lowercase(Locale.ROOT).orEmpty()
        val learningEntries = ownerEntries
            .asSequence()
            .filter { entry ->
                normalizedQuery.isEmpty() ||
                    entry.sourceText.lowercase(Locale.ROOT).contains(normalizedQuery) ||
                    entry.translation?.lowercase(Locale.ROOT)?.contains(normalizedQuery) == true
            }
            .map { entry ->
                val entryStates = statesByEntry[entry.id].orEmpty()
                val dueAt = entryDueAt(entry, entryStates)
                VocabularyLearningEntryResponse(
                    entry = entry.toResponse(),
                    stage = aggregateVocabularyStage(entryStates),
                    dueAt = dueAt,
                    overdue = !entry.practicePaused && !entry.translation.isNullOrBlank() && !dueAt.isAfter(now),
                    skills = entryStates.sortedBy { it.skill.ordinal }.map { it.toResponse() },
                )
            }
            .toList()
        val allStages = ownerEntries.associate { entry -> entry.id to aggregateVocabularyStage(statesByEntry[entry.id].orEmpty()) }
        return VocabularyDashboardResponse(
            ownerSubject = owner,
            ownerName = users.findByKeycloakSubject(owner)?.displayLabel(),
            totalCount = ownerEntries.size,
            dueCount = ownerEntries.count { entry ->
                !entry.practicePaused && !entry.translation.isNullOrBlank() &&
                    !entryDueAt(entry, statesByEntry[entry.id].orEmpty()).isAfter(now)
            },
            learningCount = allStages.values.count { it in setOf(LearningStage.NEW, LearningStage.LEARNING, LearningStage.REVIEW) },
            masteredCount = allStages.values.count { it == LearningStage.MASTERED },
            needsTranslationCount = ownerEntries.count { it.translation.isNullOrBlank() },
            difficultCount = statesByEntry.values.count { entryStates ->
                entryStates.any { it.lapseCount > 0 || it.lastRating == PracticeRating.AGAIN }
            },
            lastPracticedAt = statesByEntry.values.flatten().mapNotNull(VocabularySkillStateEntity::lastPracticedAt).maxOrNull(),
            entries = learningEntries,
        )
    }

    private fun selectEntries(
        ownerEntries: List<VocabularyEntryEntity>,
        statesByEntry: Map<UUID, List<VocabularySkillStateEntity>>,
        request: VocabularyPracticeSettingsRequest,
    ): List<VocabularyEntryEntity> {
        val eligible = ownerEntries.filter { entry ->
            entry.status == EntryStatus.ACTIVE &&
                !entry.practicePaused &&
                !entry.translation.isNullOrBlank()
        }
        val byId = eligible.associateBy(VocabularyEntryEntity::id)
        return selectPracticeEntryIds(
            candidates = eligible.map { entry ->
                VocabularySelectionCandidate(
                    id = entry.id,
                    dueAt = entryDueAt(entry, statesByEntry[entry.id].orEmpty()),
                    stage = aggregateVocabularyStage(statesByEntry[entry.id].orEmpty()),
                    updatedAt = entry.updatedAt,
                )
            },
            wordLimit = request.wordLimit,
            pinnedEntryIds = request.pinnedEntryIds,
            excludedEntryIds = request.excludedEntryIds,
            now = Instant.now(),
        ).mapNotNull(byId::get)
    }

    private fun exactContextMatch(entry: VocabularyEntryEntity): MatchResult? {
        val example = entry.example?.trim().orEmpty()
        val sourceText = entry.sourceText.trim()
        if (example.isEmpty() || sourceText.isEmpty()) return null
        val exactForm = "(?<![\\p{L}\\p{N}'’-])${Regex.escape(sourceText)}(?![\\p{L}\\p{N}'’-])"
        return Regex(exactForm, RegexOption.IGNORE_CASE).find(example)
    }

    private fun practiceResponse(practice: VocabularyPracticeEntity): VocabularyPracticeResponse =
        VocabularyPracticeResponse(
            id = practice.id,
            delivery = practice.delivery,
            mode = practice.mode,
            status = practice.status,
            lessonId = practice.lessonId,
            assignmentId = practice.assignmentId,
            sessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(practice.id).map(::sessionResponse),
            createdAt = practice.createdAt,
            updatedAt = practice.updatedAt,
        )

    private fun VocabularyPracticeEntity.toHomeworkPreparationResponse(): VocabularyHomeworkPreparationResponse =
        VocabularyHomeworkPreparationResponse(
            practiceId = id,
            sessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(id)
                .map { session -> VocabularyHomeworkSessionRef(session.id, session.ownerSubject) },
        )

    private fun sessionResponse(
        session: VocabularyPracticeSessionEntity,
        prefetchedItems: List<VocabularyPracticeItemEntity>? = null,
        prefetchedOwnerName: String? = null,
        prefetchedPractice: VocabularyPracticeEntity? = null,
    ): VocabularyPracticeSessionSummaryResponse {
        val sessionItems = prefetchedItems ?: items.findAllBySessionIdOrderByPositionAsc(session.id)
        val completed = sessionItems.count { it.completedAt != null }
        val practice = prefetchedPractice ?: practices.findById(session.practiceId).orElse(null)
        return VocabularyPracticeSessionSummaryResponse(
            id = session.id,
            ownerSubject = session.ownerSubject,
            ownerName = prefetchedOwnerName ?: users.findByKeycloakSubject(session.ownerSubject)?.displayLabel(),
            status = session.status,
            revision = session.revision,
            completedItems = completed,
            totalItems = sessionItems.size,
            correctCount = session.correctCount,
            attemptCount = session.attemptCount,
            accuracy = session.attemptCount.takeIf { it > 0 }?.let { session.correctCount.toDouble() / it },
            currentItem = if (session.status in terminalSessionStatuses) null else currentItem(session, sessionItems)?.toResponse(),
            teacherHint = session.teacherHint,
            helpRequested = session.helpRequested,
            startedAt = session.startedAt,
            completedAt = session.completedAt,
            updatedAt = session.updatedAt,
            practiceId = session.practiceId,
            delivery = practice?.delivery,
            mode = practice?.mode,
            lessonId = practice?.lessonId,
            assignmentId = practice?.assignmentId,
        )
    }

    private fun currentItem(
        session: VocabularyPracticeSessionEntity,
        sessionItems: List<VocabularyPracticeItemEntity>,
    ): VocabularyPracticeItemEntity? {
        val pending = sessionItems.filter { it.completedAt == null }
        if (pending.isEmpty()) return null
        val eligible = pending.filter { it.retryAfterSequence <= session.attemptSequence }
        return eligible.firstOrNull { it.position >= session.currentItemPosition } ?: eligible.firstOrNull()
    }

    private fun completePracticeIfNeeded(practiceId: UUID, now: Instant) {
        val practiceSessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(practiceId)
        if (practiceSessions.isNotEmpty() && practiceSessions.all { it.status in terminalSessionStatuses }) {
            val practice = practices.findById(practiceId).orElseThrow()
            practice.status = PracticeStatus.COMPLETED
            practice.completedAt = now
            practice.updatedAt = now
            practices.save(practice)
        }
    }

    private fun enqueueAssignmentProgress(assignmentId: UUID, session: VocabularyPracticeSessionEntity) {
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        assignmentProgress.enqueue(
            assignmentId = assignmentId,
            session = session,
            completedItems = sessionItems.count { it.completedAt != null },
            totalItems = sessionItems.size,
            difficultWordCount = sessionItems.count { it.attemptCount > 1 },
        )
    }

    private fun requireSessionAccess(actorSubject: String, session: VocabularyPracticeSessionEntity) {
        if (actorSubject == session.ownerSubject) return
        val practice = practices.findById(session.practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        access.requireOwnerAccess(actorSubject, session.ownerSubject, practice.lessonId)
    }

    private fun requirePracticeAccess(actorSubject: String, practice: VocabularyPracticeEntity) {
        if (practice.createdBySubject == actorSubject) return
        val practiceSessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(practice.id)
        val ownSession = practiceSessions.firstOrNull { it.ownerSubject == actorSubject }
        if (ownSession != null) return
        if (practiceSessions.isEmpty()) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        practiceSessions.forEach { session ->
            access.requireOwnerAccess(actorSubject, session.ownerSubject, practice.lessonId)
        }
    }

    private fun responseForActor(
        actorSubject: String,
        practice: VocabularyPracticeEntity,
        response: VocabularyPracticeResponse,
    ): VocabularyPracticeResponse {
        if (practice.createdBySubject == actorSubject) return response
        val ownSession = response.sessions.firstOrNull { it.ownerSubject == actorSubject } ?: return response
        return response.copy(sessions = listOf(ownSession))
    }

    private fun cloneRemainingHomework(
        request: VocabularyHomeworkPreparationRequest,
        sourcePracticeId: UUID,
    ): VocabularyHomeworkPreparationResponse {
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
        val ownerSubjects = request.ownerSubjects.mapNotNull { it.cleanSubject() }.distinct()
        if (ownerSubjects.isEmpty()) throw ResponseStatusException(HttpStatus.BAD_REQUEST)
        ownerSubjects.forEach { owner -> access.requireOwnerAccess(request.actorSubject, owner, source.lessonId) }
        val sourceSessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(source.id)
            .associateBy(VocabularyPracticeSessionEntity::ownerSubject)
        if (ownerSubjects.any { it !in sourceSessions }) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "The learner did not participate in this practice.")
        }

        val now = Instant.now()
        val homework = practices.save(
            VocabularyPracticeEntity(
                id = UUID.randomUUID(),
                createdBySubject = request.actorSubject,
                delivery = PracticeDelivery.HOMEWORK,
                status = PracticeStatus.PUBLISHED,
                assignmentId = request.assignmentId,
                mode = source.mode,
                settingsJson = objectMapper.writeValueAsString(
                    mapOf("sourcePracticeId" to source.id.toString()),
                ),
                createdAt = now,
                updatedAt = now,
            ),
        )
        ownerSubjects.forEach { owner ->
            val sourceSession = requireNotNull(sourceSessions[owner])
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
        completePracticeIfNeeded(homework.id, now)
        return homework.toHomeworkPreparationResponse()
    }

    private fun publish(
        type: String,
        actorSubject: String,
        practice: VocabularyPracticeEntity,
        response: VocabularyPracticeResponse,
        sessionId: UUID? = null,
    ) {
        events.publishEvent(
            VocabularyPracticeChangedEvent(
                type = type,
                actorSubject = actorSubject,
                practiceId = practice.id,
                lessonId = practice.lessonId,
                ownerSubjects = response.sessions.map(VocabularyPracticeSessionSummaryResponse::ownerSubject).toSet(),
                sessionId = sessionId,
                practice = response,
            ),
        )
    }

    private fun sessionEntity(sessionId: UUID): VocabularyPracticeSessionEntity =
        sessions.findById(sessionId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }

    private fun sessionEntityForUpdate(sessionId: UUID): VocabularyPracticeSessionEntity =
        sessions.lockById(sessionId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    private fun entryDueAt(entry: VocabularyEntryEntity, states: List<VocabularySkillStateEntity>): Instant {
        val required = states.filter { state ->
            state.skill in setOf(VocabularySkill.MEANING, VocabularySkill.FORM) ||
                (state.skill == VocabularySkill.CONTEXT && exactContextMatch(entry) != null)
        }
        return required.minOfOrNull(VocabularySkillStateEntity::dueAt) ?: entry.createdAt
    }

    private fun VocabularySkillStateEntity.toResponse() = VocabularySkillStateResponse(
        skill = skill,
        stage = stage,
        intervalIndex = intervalIndex,
        dueAt = dueAt,
        successStreak = successStreak,
        lapseCount = lapseCount,
        lastRating = lastRating,
        lastPracticedAt = lastPracticedAt,
    )

    private fun VocabularyPracticeItemEntity.toResponse(): VocabularyPracticeItemResponse {
        val snapshot = snapshot()
        val options = runCatching {
            objectMapper.readValue(optionsJson, object : TypeReference<List<String>>() {})
        }.getOrDefault(emptyList())
        val content = if (schemaVersion >= 2) {
            runCatching {
                objectMapper.readValue(contentJson, object : TypeReference<Map<String, Any?>>() {})
            }.getOrDefault(emptyMap())
        } else {
            emptyMap()
        }
        return VocabularyPracticeItemResponse(
            id = id,
            position = position,
            entryId = entryId,
            skill = skill,
            exerciseType = exerciseType,
            prompt = prompt,
            options = options,
            // V2 snapshots can contain the expected answer. Keep them server-side
            // until grading or an explicit flashcard reveal.
            sourceText = snapshot["sourceText"].takeIf { schemaVersion < 2 },
            translation = snapshot["translation"].takeIf { schemaVersion < 2 },
            example = snapshot["example"].takeIf { schemaVersion < 2 },
            schemaVersion = schemaVersion,
            content = content,
            affectsSchedule = affectsSchedule,
        )
    }

    private fun VocabularyPracticeItemEntity.snapshot(): Map<String, String?> =
        runCatching {
            objectMapper.readValue(snapshotJson, object : TypeReference<Map<String, String?>>() {})
        }.getOrDefault(emptyMap())

    private fun maskedHint(answer: String): String {
        var revealNext = true
        return answer.trim().map { character ->
            when {
                character.isWhitespace() -> {
                    revealNext = true
                    character
                }
                revealNext -> {
                    revealNext = false
                    character
                }
                else -> '•'
            }
        }.joinToString("")
    }

    private fun String?.cleanSubject(): String? = this?.trim()?.takeIf(String::isNotEmpty)?.take(255)
    private fun com.playsay.vocabulary.entity.VocabularyUserProjection.displayLabel(): String =
        displayName?.trim()?.takeIf(String::isNotEmpty)
            ?: username?.trim()?.takeIf(String::isNotEmpty)
            ?: keycloakSubject
}

private val activePracticeStatuses = setOf(PracticeStatus.PUBLISHED, PracticeStatus.ACTIVE, PracticeStatus.PAUSED)
private val terminalPracticeStatuses = setOf(PracticeStatus.COMPLETED, PracticeStatus.CANCELLED, PracticeStatus.FAILED)
private val terminalSessionStatuses = setOf(SessionStatus.COMPLETED, SessionStatus.CANCELLED)
