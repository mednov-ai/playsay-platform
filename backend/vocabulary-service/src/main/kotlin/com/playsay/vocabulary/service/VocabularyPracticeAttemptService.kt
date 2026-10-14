package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyAttemptRequest
import com.playsay.vocabulary.dto.VocabularyAttemptResponse
import com.playsay.vocabulary.dto.VocabularyPracticeRevealResponse
import com.playsay.vocabulary.dto.VocabularyPracticeSessionSummaryResponse
import com.playsay.vocabulary.dto.VocabularyEvidenceType
import com.playsay.vocabulary.entity.VocabularyPracticeAttemptEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.repo.VocabularyPracticeAttemptRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import com.playsay.vocabulary.util.maskedVocabularyHint
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyPracticeAttemptService(
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    private val grading: VocabularySessionGradingService,
    private val learningEvidence: VocabularyLearningEvidenceService,
    private val queryService: VocabularyPracticeQueryService,
    private val outcome: VocabularyPracticeOutcomeService,
) {
    fun attempt(actorSubject: String, sessionId: UUID, request: VocabularyAttemptRequest): VocabularyAttemptResponse {
        val session = sessionEntityForUpdate(sessionId)
        requireOpenSession(actorSubject, session)
        existingAttemptResponse(session, request)?.let { return it }
        val item = requireCurrentItem(session, request)
        val now = Instant.now()
        val result = recordAttempt(session, item, request, now)
        recordLearningEvidence(session, item, result, request, now)
        updateSessionAfterAttempt(session, result.correct, now)
        updateItemAfterAttempt(session, item, result.rating, now)
        finishSession(session, now)
        val response = queryService.sessionResponse(session)
        outcome.publishAttempt(actorSubject, session, now)
        return VocabularyAttemptResponse(result.attempt.id, result.rating, result.correct, item.answer, response)
    }

    private fun recordLearningEvidence(
        session: VocabularyPracticeSessionEntity,
        item: VocabularyPracticeItemEntity,
        result: RecordedAttempt,
        request: VocabularyAttemptRequest,
        now: Instant,
    ) {
        val entryId = item.entryId ?: return
        val evidenceType = if (item.exerciseType == PracticeExerciseType.FLASHCARD) {
            VocabularyEvidenceType.SELF_RATING
        } else {
            VocabularyEvidenceType.RETRIEVAL
        }
        learningEvidence.record(
            VocabularyEvidenceCommand(
                ownerSubject = session.ownerSubject,
                entryId = entryId,
                clientEvidenceId = "attempt:${request.clientAttemptId}",
                evidenceType = evidenceType,
                skill = item.skill,
                exerciseType = item.exerciseType,
                sessionId = session.id,
                itemId = item.id,
                answerText = request.answer,
                correct = result.correct,
                rating = result.rating,
                hintsUsed = request.hintsUsed,
                durationMs = request.durationMs,
                scheduleCredit = result.scheduleCreditApplied,
                occurredAt = now,
            ),
        )
        if (!result.correct) {
            learningEvidence.record(
                VocabularyEvidenceCommand(
                    ownerSubject = session.ownerSubject,
                    entryId = entryId,
                    clientEvidenceId = "correction:${request.clientAttemptId}",
                    evidenceType = VocabularyEvidenceType.CORRECTION,
                    skill = item.skill,
                    exerciseType = item.exerciseType,
                    sessionId = session.id,
                    itemId = item.id,
                    correct = false,
                    occurredAt = now,
                ),
            )
        }
    }

    private fun requireOpenSession(actorSubject: String, session: VocabularyPracticeSessionEntity) {
        if (actorSubject != session.ownerSubject) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val practice = practices.findById(session.practiceId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (practice.status == PracticeStatus.PAUSED) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice is paused.")
        }
        if (practice.status in attemptTerminalPracticeStatuses || session.status in attemptTerminalSessionStatuses) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice is already complete.")
        }
    }

    private fun existingAttemptResponse(
        session: VocabularyPracticeSessionEntity,
        request: VocabularyAttemptRequest,
    ): VocabularyAttemptResponse? =
        attempts.findByOwnerSubjectAndClientAttemptId(session.ownerSubject, request.clientAttemptId)?.let { existing ->
            val item = items.findByIdAndSessionId(existing.itemId, session.id)
                ?: throw ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "The previous vocabulary attempt is no longer available.",
                )
            VocabularyAttemptResponse(
                existing.id,
                existing.rating,
                existing.correct,
                item.answer,
                queryService.sessionResponse(session),
            )
        }

    private fun requireCurrentItem(
        session: VocabularyPracticeSessionEntity,
        request: VocabularyAttemptRequest,
    ): VocabularyPracticeItemEntity {
        if (request.sessionRevision != session.revision) {
            throw ResponseStatusException(
                HttpStatus.CONFLICT,
                "Vocabulary practice has changed; reload the current item.",
            )
        }
        val item = items.findByIdAndSessionId(request.itemId, session.id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val current = queryService.currentItem(session, items.findAllBySessionIdOrderByPositionAsc(session.id))
        if (current?.id != item.id) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "This is not the current vocabulary item.")
        }
        return item
    }

    private fun recordAttempt(
        session: VocabularyPracticeSessionEntity,
        item: VocabularyPracticeItemEntity,
        request: VocabularyAttemptRequest,
        now: Instant,
    ): RecordedAttempt {
        val decision = grading.grade(item, request)
        val scheduleCreditApplied = item.affectsSchedule &&
            item.entryId?.let { entryId -> !attempts.hasScheduleCredit(session.id, entryId, item.skill) } == true
        val entity = attempts.save(
            VocabularyPracticeAttemptEntity(
                id = UUID.randomUUID(),
                sessionId = session.id,
                itemId = item.id,
                ownerSubject = session.ownerSubject,
                clientAttemptId = request.clientAttemptId.trim(),
                rating = decision.rating,
                answerText = request.answer?.take(2_000),
                correct = decision.correct,
                hintsUsed = request.hintsUsed.coerceIn(0, 100),
                durationMs = request.durationMs.coerceIn(0, 3_600_000),
                scheduleCreditApplied = scheduleCreditApplied,
                createdAt = now,
            ),
        )
        return RecordedAttempt(entity, decision.rating, decision.correct, scheduleCreditApplied)
    }

    private fun updateSessionAfterAttempt(session: VocabularyPracticeSessionEntity, correct: Boolean, now: Instant) {
        session.attemptSequence += 1
        session.attemptCount += 1
        session.revision += 1
        session.updatedAt = now
        session.teacherHint = null
        session.helpRequested = false
        if (session.startedAt == null) session.startedAt = now
        if (session.status in setOf(SessionStatus.NOT_STARTED, SessionStatus.PAUSED)) {
            session.status = SessionStatus.IN_PROGRESS
        }
        if (correct) session.correctCount += 1
    }

    private fun updateItemAfterAttempt(
        session: VocabularyPracticeSessionEntity,
        item: VocabularyPracticeItemEntity,
        rating: PracticeRating,
        now: Instant,
    ) {
        item.attemptCount += 1
        item.updatedAt = now
        if (rating == PracticeRating.AGAIN) {
            val otherPendingCount = items.findAllBySessionIdOrderByPositionAsc(session.id)
                .count { candidate -> candidate.id != item.id && candidate.completedAt == null }
            item.retryAfterSequence = session.attemptSequence + otherPendingCount.coerceIn(0, 3)
        } else {
            item.completedAt = now
        }
        items.save(item)
    }

    private fun finishSession(session: VocabularyPracticeSessionEntity, now: Instant) {
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        val next = queryService.currentItem(session, sessionItems)
        if (next == null || sessionItems.all { it.completedAt != null }) {
            session.status = SessionStatus.COMPLETED
            session.completedAt = now
        } else {
            session.currentItemPosition = next.position
        }
        sessions.save(session)
    }

    fun reveal(actorSubject: String, sessionId: UUID, itemId: UUID): VocabularyPracticeRevealResponse {
        val session = sessions.findById(sessionId).orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (actorSubject != session.ownerSubject) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        if (session.status in attemptTerminalSessionStatuses) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Vocabulary practice is already complete.")
        }
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        val item = items.findByIdAndSessionId(itemId, session.id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (
            queryService.currentItem(session, sessionItems)?.id != item.id ||
            item.exerciseType != PracticeExerciseType.FLASHCARD
        ) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Only the current flashcard can be revealed.")
        }
        item.entryId?.let { entryId ->
            learningEvidence.record(
                VocabularyEvidenceCommand(
                    ownerSubject = session.ownerSubject,
                    entryId = entryId,
                    clientEvidenceId = "presentation:${session.id}:${item.id}",
                    evidenceType = VocabularyEvidenceType.PRESENTATION,
                    skill = item.skill,
                    exerciseType = item.exerciseType,
                    sessionId = session.id,
                    itemId = item.id,
                ),
            )
        }
        return VocabularyPracticeRevealResponse(item.id, item.answer)
    }

    fun giveHint(actorSubject: String, sessionId: UUID): VocabularyPracticeSessionSummaryResponse {
        val session = sessionEntityForUpdate(sessionId)
        val practice = practices.findById(session.practiceId)
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (practice.createdBySubject != actorSubject || practice.delivery != PracticeDelivery.LIVE) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        val current = queryService.currentItem(session, items.findAllBySessionIdOrderByPositionAsc(session.id))
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "There is no current vocabulary item.")
        current.entryId?.let { entryId ->
            learningEvidence.record(
                VocabularyEvidenceCommand(
                    ownerSubject = session.ownerSubject,
                    entryId = entryId,
                    clientEvidenceId = "hint:${session.id}:${current.id}:${session.revision}",
                    evidenceType = VocabularyEvidenceType.HINT,
                    skill = current.skill,
                    exerciseType = current.exerciseType,
                    sessionId = session.id,
                    itemId = current.id,
                ),
            )
        }
        session.teacherHint = maskedVocabularyHint(current.answer)
        session.helpRequested = false
        session.revision += 1
        session.updatedAt = Instant.now()
        sessions.save(session)
        outcome.publishSessionUpdated(actorSubject, practice, session)
        return queryService.sessionResponse(session)
    }

    fun requestHelp(actorSubject: String, sessionId: UUID): VocabularyPracticeSessionSummaryResponse {
        val session = sessionEntityForUpdate(sessionId)
        val practice = practices.findById(session.practiceId)
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND) }
        if (
            practice.delivery != PracticeDelivery.LIVE ||
            actorSubject != session.ownerSubject ||
            practice.status !in setOf(PracticeStatus.PUBLISHED, PracticeStatus.ACTIVE) ||
            session.status in attemptTerminalSessionStatuses
        ) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        session.helpRequested = true
        session.revision += 1
        session.updatedAt = Instant.now()
        sessions.save(session)
        outcome.publishSessionUpdated(actorSubject, practice, session)
        return queryService.sessionResponse(session)
    }

    private fun sessionEntityForUpdate(sessionId: UUID): VocabularyPracticeSessionEntity =
        sessions.lockById(sessionId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

}

private data class RecordedAttempt(
    val attempt: VocabularyPracticeAttemptEntity,
    val rating: PracticeRating,
    val correct: Boolean,
    val scheduleCreditApplied: Boolean,
)

private val attemptTerminalPracticeStatuses = setOf(
    PracticeStatus.COMPLETED,
    PracticeStatus.CANCELLED,
    PracticeStatus.FAILED,
)
private val attemptTerminalSessionStatuses = setOf(SessionStatus.COMPLETED, SessionStatus.CANCELLED)
