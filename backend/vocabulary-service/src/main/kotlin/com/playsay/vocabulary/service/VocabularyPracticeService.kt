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

    @Transactional
    fun learners(actorSubject: String, query: String?): List<VocabularyLearnerSummaryResponse> {
        val normalizedQuery = query?.trim()?.lowercase(Locale.ROOT).orEmpty()
        return access.manageableLearners(actorSubject)
            .asSequence()
            .filter { learner ->
                normalizedQuery.isEmpty() ||
                    learner.displayLabel().lowercase(Locale.ROOT).contains(normalizedQuery) ||
                    learner.username?.lowercase(Locale.ROOT)?.contains(normalizedQuery) == true
            }
            .map { learner ->
                val ownerEntries = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(learner.keycloakSubject, EntryStatus.ACTIVE)
                val statesByEntry = ensureStates(ownerEntries).groupBy(VocabularySkillStateEntity::entryId)
                val dashboard = dashboardResponse(learner.keycloakSubject, ownerEntries, statesByEntry, null)
                VocabularyLearnerSummaryResponse(
                    ownerSubject = dashboard.ownerSubject,
                    ownerName = dashboard.ownerName ?: learner.displayLabel(),
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
        val owners = resolveOwners(actorSubject, request)
        val previews = owners.map { owner ->
            val ownerEntries = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(owner, EntryStatus.ACTIVE)
            val statesByEntry = ensureStates(ownerEntries).groupBy(VocabularySkillStateEntity::entryId)
            val selected = selectEntries(ownerEntries, statesByEntry, request)
            val now = Instant.now()
            VocabularyPracticeOwnerPreviewResponse(
                ownerSubject = owner,
                ownerName = users.findByKeycloakSubject(owner)?.displayLabel(),
                selectedCount = selected.size,
                estimatedItemCount = estimateItemCount(selected, statesByEntry, request.mode),
                dueCount = selected.count { entry -> entryDueAt(entry, statesByEntry[entry.id].orEmpty()).let { !it.isAfter(now) } },
                newCount = selected.count { entry -> aggregateVocabularyStage(statesByEntry[entry.id].orEmpty()) == LearningStage.NEW },
                needsTranslationCount = ownerEntries.count { it.translation.isNullOrBlank() },
                entries = selected.map { it.toResponse() },
            )
        }
        val itemCount = previews.sumOf(VocabularyPracticeOwnerPreviewResponse::estimatedItemCount)
        return VocabularyPracticePreviewResponse(
            mode = request.mode,
            delivery = request.delivery,
            estimatedMinutes = ceil(itemCount / 2.2).toInt().coerceAtLeast(if (itemCount == 0) 0 else 1),
            owners = previews,
        )
    }

    @Transactional
    fun create(actorSubject: String, request: VocabularyPracticeSettingsRequest): VocabularyPracticeResponse {
        val owners = resolveOwners(actorSubject, request)
        if (request.delivery == PracticeDelivery.LIVE && request.lessonId == null) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "lessonId is required for live vocabulary practice.")
        }
        if (request.delivery == PracticeDelivery.LIVE) {
            access.lockLesson(requireNotNull(request.lessonId))
            val existing = practices.findFirstByLessonIdAndStatusInOrderByUpdatedAtDesc(
                requireNotNull(request.lessonId),
                activePracticeStatuses,
            )
            if (existing != null) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "A vocabulary practice is already active for this lesson.")
            }
        }

        val now = Instant.now()
        val practice = practices.save(
            VocabularyPracticeEntity(
                id = UUID.randomUUID(),
                createdBySubject = actorSubject,
                delivery = request.delivery,
                status = if (request.delivery in setOf(PracticeDelivery.SELF, PracticeDelivery.LIVE)) PracticeStatus.ACTIVE else PracticeStatus.PUBLISHED,
                lessonId = request.lessonId,
                assignmentId = request.assignmentId,
                mode = request.mode,
                settingsJson = objectMapper.writeValueAsString(request),
                startedAt = if (request.delivery in setOf(PracticeDelivery.SELF, PracticeDelivery.LIVE)) now else null,
                createdAt = now,
                updatedAt = now,
            ),
        )

        owners.forEach { owner ->
            val ownerEntries = entries.findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(owner, EntryStatus.ACTIVE)
            val statesByEntry = ensureStates(ownerEntries).groupBy(VocabularySkillStateEntity::entryId)
            val selected = selectEntries(ownerEntries, statesByEntry, request)
            val session = sessions.save(
                VocabularyPracticeSessionEntity(
                    id = UUID.randomUUID(),
                    practiceId = practice.id,
                    ownerSubject = owner,
                    status = if (selected.isEmpty()) SessionStatus.COMPLETED else SessionStatus.NOT_STARTED,
                    completedAt = if (selected.isEmpty()) now else null,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
            items.saveAll(generateItems(session.id, selected, statesByEntry, request.mode, practice.id, now))
        }
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
        val practice = practices.findById(practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (practice.createdBySubject != actorSubject) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        if (request.status !in mutablePracticeStatuses) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported vocabulary practice status.")
        }
        val now = Instant.now()
        practice.status = request.status
        practice.updatedAt = now
        if (request.status == PracticeStatus.ACTIVE && practice.startedAt == null) practice.startedAt = now
        if (request.status in setOf(PracticeStatus.COMPLETED, PracticeStatus.CANCELLED)) practice.completedAt = now
        val practiceSessions = sessions.findAllByPracticeIdOrderByCreatedAtAsc(practice.id)
        practiceSessions.forEach { session ->
            session.status = when (request.status) {
                PracticeStatus.PAUSED -> if (session.status == SessionStatus.IN_PROGRESS) SessionStatus.PAUSED else session.status
                PracticeStatus.ACTIVE -> if (session.status == SessionStatus.PAUSED) SessionStatus.IN_PROGRESS else session.status
                PracticeStatus.CANCELLED -> if (session.status != SessionStatus.COMPLETED) SessionStatus.CANCELLED else session.status
                PracticeStatus.COMPLETED -> if (session.status != SessionStatus.COMPLETED) SessionStatus.COMPLETED else session.status
                else -> session.status
            }
            if (session.status == SessionStatus.COMPLETED && session.completedAt == null) session.completedAt = now
            session.revision += 1
            session.updatedAt = now
        }
        sessions.saveAll(practiceSessions)
        practices.save(practice)
        practice.assignmentId?.let { assignmentId ->
            practiceSessions.forEach { session -> enqueueAssignmentProgress(assignmentId, session) }
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
        practices.findLivePracticesForClosedLessons().forEach { practice ->
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
    fun history(actorSubject: String, ownerSubject: String?, lessonId: UUID?): List<VocabularyPracticeSessionSummaryResponse> {
        val owner = access.requireOwnerAccess(actorSubject, ownerSubject.cleanSubject() ?: actorSubject, lessonId)
        return sessions.findAllByOwnerSubjectOrderByUpdatedAtDesc(owner)
            .take(50)
            .map(::sessionResponse)
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
        val normalizedAnswer = normalizeAnswer(request.answer)
        val objective = item.exerciseType !in selfRatedExercises
        val answerCorrect = !objective || normalizedAnswer == normalizeAnswer(item.answer)
        val rating = when {
            objective && !answerCorrect -> PracticeRating.AGAIN
            request.hintsUsed > 0 -> PracticeRating.HARD
            request.rating != null -> request.rating
            else -> PracticeRating.GOOD
        }
        val correct = rating != PracticeRating.AGAIN
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
            item.retryAfterSequence = session.attemptSequence + 3
        } else {
            item.completedAt = now
        }
        items.save(item)

        item.entryId?.let { entryId ->
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
            attempts.save(
                VocabularyPracticeAttemptEntity(
                    id = UUID.randomUUID(),
                    sessionId = session.id,
                    itemId = item.id,
                    ownerSubject = session.ownerSubject,
                    clientAttemptId = clientAttemptId,
                    rating = rating,
                    correct = rating == PracticeRating.GOOD,
                    createdAt = now,
                ),
            )
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

    private fun resolveOwners(actorSubject: String, request: VocabularyPracticeSettingsRequest): List<String> {
        val requested = request.ownerSubjects.mapNotNull { it.cleanSubject() }.distinct()
        val owners = if (requested.isEmpty()) listOf(actorSubject) else requested
        if (request.delivery == PracticeDelivery.LIVE) {
            val lessonId = request.lessonId
                ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "lessonId is required for live vocabulary practice.")
            owners.forEach { owner -> access.requireLessonOwnerAccess(actorSubject, owner, lessonId) }
        } else {
            owners.forEach { owner -> access.requireOwnerAccess(actorSubject, owner, request.lessonId) }
        }
        return owners
    }

    private fun ensureStates(ownerEntries: List<VocabularyEntryEntity>): List<VocabularySkillStateEntity> {
        if (ownerEntries.isEmpty()) return emptyList()
        val existing = skillStates.findAllByEntryIdIn(ownerEntries.map(VocabularyEntryEntity::id)).toMutableList()
        val existingKeys = existing.mapTo(mutableSetOf()) { it.entryId to it.skill }
        val now = Instant.now()
        ownerEntries.forEach { entry ->
            VocabularySkill.entries.forEach { skill ->
                if ((entry.id to skill) !in existingKeys) {
                    existing += VocabularySkillStateEntity(
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
        return skillStates.saveAll(existing)
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

    private fun generateItems(
        sessionId: UUID,
        selected: List<VocabularyEntryEntity>,
        statesByEntry: Map<UUID, List<VocabularySkillStateEntity>>,
        mode: PracticeMode,
        seed: UUID,
        now: Instant,
    ): List<VocabularyPracticeItemEntity> {
        val translations = selected.mapNotNull(VocabularyEntryEntity::translation).distinct()
        val generated = mutableListOf<GeneratedPracticeItem>()
        selected.forEachIndexed { index, entry ->
            val entryStates = statesByEntry[entry.id].orEmpty()
            val stage = aggregateVocabularyStage(entryStates)
            generated += generatedItemsForEntry(entry, stage, entryStates, mode, translations, index, seed)
        }
        return generated.mapIndexed { position, generatedItem ->
            VocabularyPracticeItemEntity(
                id = UUID.randomUUID(),
                sessionId = sessionId,
                entryId = generatedItem.entry.id,
                position = position,
                skill = generatedItem.skill,
                exerciseType = generatedItem.type,
                prompt = generatedItem.prompt,
                answer = generatedItem.answer,
                optionsJson = objectMapper.writeValueAsString(generatedItem.options),
                snapshotJson = objectMapper.writeValueAsString(
                    mapOf(
                        "sourceText" to generatedItem.entry.sourceText,
                        "translation" to generatedItem.entry.translation,
                        "example" to generatedItem.entry.example,
                        "exampleTranslation" to generatedItem.entry.exampleTranslation,
                    ),
                ),
                createdAt = now,
                updatedAt = now,
            )
        }
    }

    private fun generatedItemsForEntry(
        entry: VocabularyEntryEntity,
        stage: LearningStage,
        entryStates: List<VocabularySkillStateEntity>,
        mode: PracticeMode,
        translations: List<String>,
        index: Int,
        seed: UUID,
    ): List<GeneratedPracticeItem> {
        if (mode == PracticeMode.KEYBOARD) {
            return listOf(GeneratedPracticeItem(entry, VocabularySkill.SPELLING, PracticeExerciseType.KEYBOARD, entry.sourceText, entry.sourceText))
        }
        val meaningOptions = deterministicOptions(entry.translation.orEmpty(), translations, seed, index)
        val primary = when (stage) {
            LearningStage.NEW -> GeneratedPracticeItem(
                entry,
                VocabularySkill.MEANING,
                if (index % 2 == 0) PracticeExerciseType.FLASHCARD else PracticeExerciseType.MATCHING,
                entry.sourceText,
                entry.translation.orEmpty(),
                meaningOptions,
            )
            LearningStage.LEARNING -> {
                val meaningInterval = entryStates.firstOrNull { it.skill == VocabularySkill.MEANING }?.intervalIndex ?: 0
                val formInterval = entryStates.firstOrNull { it.skill == VocabularySkill.FORM }?.intervalIndex ?: 0
                if (mode == PracticeMode.QUICK && formInterval < meaningInterval) {
                    productiveItem(entry)
                } else {
                    GeneratedPracticeItem(
                        entry,
                        VocabularySkill.MEANING,
                        PracticeExerciseType.MEANING_CHOICE,
                        entry.sourceText,
                        entry.translation.orEmpty(),
                        meaningOptions,
                    )
                }
            }
            LearningStage.REVIEW, LearningStage.MASTERED -> {
                val formInterval = entryStates.firstOrNull { it.skill == VocabularySkill.FORM }?.intervalIndex ?: 0
                val contextInterval = entryStates.firstOrNull { it.skill == VocabularySkill.CONTEXT }?.intervalIndex ?: 0
                if (mode == PracticeMode.QUICK && contextInterval < formInterval) {
                    contextItem(entry) ?: productiveItem(entry)
                } else {
                    productiveItem(entry)
                }
            }
        }
        val secondary = when {
            mode == PracticeMode.QUICK -> null
            stage == LearningStage.NEW -> GeneratedPracticeItem(
                entry,
                VocabularySkill.MEANING,
                PracticeExerciseType.MEANING_CHOICE,
                entry.sourceText,
                entry.translation.orEmpty(),
                meaningOptions,
            )
            stage == LearningStage.LEARNING -> productiveItem(entry)
            contextItem(entry) != null -> contextItem(entry)
            mode == PracticeMode.WRITING -> productiveItem(entry)
            entry.sourceText.trim().contains(' ') -> GeneratedPracticeItem(
                entry,
                VocabularySkill.FORM,
                PracticeExerciseType.PHRASE_BUILDER,
                entry.translation.orEmpty(),
                entry.sourceText,
                entry.sourceText.trim().split(Regex("\\s+")).shuffled(java.util.Random(seed.mostSignificantBits xor index.toLong())),
            )
            else -> productiveItem(entry)
        }
        return listOfNotNull(primary, secondary)
    }

    private fun productiveItem(entry: VocabularyEntryEntity) = GeneratedPracticeItem(
        entry = entry,
        skill = VocabularySkill.FORM,
        type = PracticeExerciseType.FORM_INPUT,
        prompt = entry.translation.orEmpty(),
        answer = entry.sourceText,
    )

    private fun contextItem(entry: VocabularyEntryEntity): GeneratedPracticeItem? {
        val example = entry.example?.trim().orEmpty()
        if (example.isEmpty()) return null
        val match = exactContextMatch(entry) ?: return null
        val prompt = example.replaceRange(match.range, "___")
        return GeneratedPracticeItem(entry, VocabularySkill.CONTEXT, PracticeExerciseType.CONTEXT_GAP, prompt, match.value)
    }

    private fun exactContextMatch(entry: VocabularyEntryEntity): MatchResult? {
        val example = entry.example?.trim().orEmpty()
        val sourceText = entry.sourceText.trim()
        if (example.isEmpty() || sourceText.isEmpty()) return null
        val exactForm = "(?<![\\p{L}\\p{N}'’-])${Regex.escape(sourceText)}(?![\\p{L}\\p{N}'’-])"
        return Regex(exactForm, RegexOption.IGNORE_CASE).find(example)
    }

    private fun deterministicOptions(answer: String, available: List<String>, seed: UUID, salt: Int): List<String> {
        val others = available.filterNot { normalizeAnswer(it) == normalizeAnswer(answer) }
            .sortedBy { option -> option.hashCode().toLong() xor seed.leastSignificantBits xor salt.toLong() }
            .take(3)
        return (others + answer)
            .distinct()
            .sortedBy { option -> option.hashCode().toLong() xor seed.mostSignificantBits xor salt.toLong() }
    }

    private fun estimateItemCount(
        selected: List<VocabularyEntryEntity>,
        statesByEntry: Map<UUID, List<VocabularySkillStateEntity>>,
        mode: PracticeMode,
    ): Int = selected.sumOf { entry ->
        generatedItemsForEntry(
            entry,
            aggregateVocabularyStage(statesByEntry[entry.id].orEmpty()),
            statesByEntry[entry.id].orEmpty(),
            mode,
            selected.mapNotNull(VocabularyEntryEntity::translation),
            0,
            entry.id,
        ).size
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

    private fun sessionResponse(session: VocabularyPracticeSessionEntity): VocabularyPracticeSessionSummaryResponse {
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        val completed = sessionItems.count { it.completedAt != null }
        return VocabularyPracticeSessionSummaryResponse(
            id = session.id,
            ownerSubject = session.ownerSubject,
            ownerName = users.findByKeycloakSubject(session.ownerSubject)?.displayLabel(),
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
        )
    }

    private fun currentItem(
        session: VocabularyPracticeSessionEntity,
        sessionItems: List<VocabularyPracticeItemEntity>,
    ): VocabularyPracticeItemEntity? {
        val pending = sessionItems.filter { it.completedAt == null }
        if (pending.isEmpty()) return null
        val eligible = pending.filter { it.retryAfterSequence <= session.attemptSequence }
        val pool = if (eligible.isEmpty()) pending else eligible
        return pool.firstOrNull { it.position >= session.currentItemPosition } ?: pool.first()
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
                settingsJson = objectMapper.writeValueAsString(request),
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
        return VocabularyPracticeItemResponse(
            id = id,
            position = position,
            entryId = entryId,
            skill = skill,
            exerciseType = exerciseType,
            prompt = prompt,
            options = options,
            sourceText = snapshot["sourceText"],
            translation = snapshot["translation"],
            example = snapshot["example"],
        )
    }

    private fun VocabularyPracticeItemEntity.snapshot(): Map<String, String?> =
        runCatching {
            objectMapper.readValue(snapshotJson, object : TypeReference<Map<String, String?>>() {})
        }.getOrDefault(emptyMap())

    private fun normalizeAnswer(value: String?): String = Normalizer.normalize(value.orEmpty(), Normalizer.Form.NFKC)
        .lowercase(Locale.ROOT)
        .replace('’', '\'')
        .replace(Regex("[\\s\\p{Punct}]+"), " ")
        .trim()

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

private data class GeneratedPracticeItem(
    val entry: VocabularyEntryEntity,
    val skill: VocabularySkill,
    val type: PracticeExerciseType,
    val prompt: String,
    val answer: String,
    val options: List<String> = emptyList(),
)

private val activePracticeStatuses = setOf(PracticeStatus.PUBLISHED, PracticeStatus.ACTIVE, PracticeStatus.PAUSED)
private val mutablePracticeStatuses = setOf(PracticeStatus.ACTIVE, PracticeStatus.PAUSED, PracticeStatus.COMPLETED, PracticeStatus.CANCELLED)
private val terminalPracticeStatuses = setOf(PracticeStatus.COMPLETED, PracticeStatus.CANCELLED, PracticeStatus.FAILED)
private val terminalSessionStatuses = setOf(SessionStatus.COMPLETED, SessionStatus.CANCELLED)
private val selfRatedExercises = setOf(PracticeExerciseType.FLASHCARD)
