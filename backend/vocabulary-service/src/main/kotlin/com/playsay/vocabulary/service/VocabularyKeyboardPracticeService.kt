package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyKeyItemResponse
import com.playsay.vocabulary.dto.VocabularyKeyResultRequest
import com.playsay.vocabulary.dto.VocabularyKeyWordAttemptRequest
import com.playsay.vocabulary.dto.VocabularyKeySetResponse
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyPracticeAttemptEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.entity.VocabularyUserProjection
import com.playsay.vocabulary.mapper.toResponse
import com.playsay.vocabulary.mapper.VocabularyPracticeResponseMapper
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeAttemptRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyKeyboardPracticeService(
    private val queryService: VocabularyKeyboardQueryService,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    private val skillStates: VocabularySkillStateRepo,
    private val outcome: VocabularyPracticeOutcomeService,
) {
    fun keySet(actorSubject: String, sessionId: UUID): VocabularyKeySetResponse =
        queryService.keySet(actorSubject, sessionId)

    fun recordKeyResult(sessionId: UUID, request: VocabularyKeyResultRequest) {
        val session = sessionEntityForUpdate(sessionId)
        val practice = practices.findById(session.practiceId).orElseThrow()
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
            .associateBy(VocabularyPracticeItemEntity::id)
        val now = Instant.now()
        val changed = request.attempts.distinctBy { it.itemId }
            .map { keyAttempt ->
                recordAttempt(session, sessionItems[keyAttempt.itemId], keyAttempt, request.clientResultId, now)
            }
            .any { it }
        if (!changed) return
        finishSession(session, practice.status, now)
        outcome.publishAttempt(session.ownerSubject, session, now)
    }

    private fun recordAttempt(
        session: VocabularyPracticeSessionEntity,
        item: VocabularyPracticeItemEntity?,
        keyAttempt: VocabularyKeyWordAttemptRequest,
        clientResultId: String,
        now: Instant,
    ): Boolean {
        if (item == null || item.entryId != keyAttempt.entryId || item.skill != VocabularySkill.SPELLING) return false
        val clientAttemptId = "key:$clientResultId:${item.id}".take(128)
        if (attempts.findByOwnerSubjectAndClientAttemptId(session.ownerSubject, clientAttemptId) != null) return false
        val rating = if (keyAttempt.errors <= 0) PracticeRating.GOOD else PracticeRating.AGAIN
        val scheduleCreditApplied = !attempts.hasScheduleCredit(session.id, keyAttempt.entryId, VocabularySkill.SPELLING)
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
        if (scheduleCreditApplied) updateSpellingSchedule(session, keyAttempt, rating, now)
        item.attemptCount += 1
        item.completedAt = now
        item.updatedAt = now
        items.save(item)
        session.attemptCount += 1
        if (rating == PracticeRating.GOOD) session.correctCount += 1
        return true
    }

    private fun updateSpellingSchedule(
        session: VocabularyPracticeSessionEntity,
        keyAttempt: VocabularyKeyWordAttemptRequest,
        rating: PracticeRating,
        now: Instant,
    ) {
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

    private fun finishSession(session: VocabularyPracticeSessionEntity, practiceStatus: PracticeStatus, now: Instant) {
        session.revision += 1
        session.updatedAt = now
        if (session.startedAt == null) session.startedAt = now
        val refreshedItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
        if (refreshedItems.all { it.completedAt != null }) {
            session.status = SessionStatus.COMPLETED
            session.completedAt = now
        } else if (practiceStatus in keyboardTerminalPracticeStatuses) {
            session.status = SessionStatus.COMPLETED
        } else if (practiceStatus == PracticeStatus.PAUSED) {
            session.status = SessionStatus.PAUSED
        } else {
            session.status = SessionStatus.IN_PROGRESS
        }
        sessions.save(session)
    }

    private fun sessionEntityForUpdate(sessionId: UUID): VocabularyPracticeSessionEntity =
        sessions.lockById(sessionId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

}

private val keyboardTerminalPracticeStatuses = setOf(
    PracticeStatus.COMPLETED,
    PracticeStatus.CANCELLED,
    PracticeStatus.FAILED,
)
