package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularyKeyResultRequest
import com.playsay.vocabulary.dto.VocabularyKeyAcknowledgementRequest
import com.playsay.vocabulary.dto.VocabularyKeyAcknowledgementResponse
import com.playsay.vocabulary.dto.VocabularyKeyTargetType
import com.playsay.vocabulary.dto.VocabularyKeyWordAttemptRequest
import com.playsay.vocabulary.dto.VocabularyKeySetResponse
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.dto.VocabularyEvidenceType
import com.playsay.vocabulary.entity.VocabularyPracticeAttemptEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularyKeyResultEntity
import com.playsay.vocabulary.repo.VocabularyKeyResultRepo
import com.playsay.vocabulary.repo.VocabularyKeySnapshotRepo
import com.playsay.vocabulary.repo.VocabularyKeyTargetRepo
import com.playsay.vocabulary.repo.VocabularyPracticeAttemptRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import com.playsay.vocabulary.repo.VocabularyPracticeRepo
import com.playsay.vocabulary.repo.VocabularyPracticeSessionRepo
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import io.micrometer.core.instrument.MeterRegistry

@Service
class VocabularyKeyboardPracticeService(
    private val queryService: VocabularyKeyboardQueryService,
    private val practices: VocabularyPracticeRepo,
    private val sessions: VocabularyPracticeSessionRepo,
    private val items: VocabularyPracticeItemRepo,
    private val attempts: VocabularyPracticeAttemptRepo,
    private val keySnapshots: VocabularyKeySnapshotRepo,
    private val keyTargets: VocabularyKeyTargetRepo,
    private val keyResults: VocabularyKeyResultRepo,
    private val learningEvidence: VocabularyLearningEvidenceService,
    private val outcome: VocabularyPracticeOutcomeService,
    private val objectMapper: ObjectMapper,
    private val meters: MeterRegistry,
) {
    fun keySet(actorSubject: String, sessionId: UUID): VocabularyKeySetResponse =
        queryService.keySet(actorSubject, sessionId)

    @Transactional
    fun acknowledgePosition(
        actorSubject: String,
        sessionId: UUID,
        request: VocabularyKeyAcknowledgementRequest,
    ): VocabularyKeyAcknowledgementResponse {
        val session = sessionEntityForUpdate(sessionId)
        if (session.ownerSubject != actorSubject) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val snapshot = keySnapshots.findBySessionId(session.id)
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Key snapshot has not been materialized")
        val targets = keyTargets.findAllBySnapshotIdOrderByPositionAsc(snapshot.id)
        if (request.position > targets.size) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Position exceeds target count")
        if (request.targetId != null && request.position > 0 && targets.getOrNull(request.position - 1)?.id != request.targetId) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Target does not match acknowledged position")
        }
        if (request.position > session.currentItemPosition) {
            session.currentItemPosition = request.position
            session.revision += 1
            session.updatedAt = Instant.now()
            if (session.startedAt == null) session.startedAt = session.updatedAt
            if (session.status == SessionStatus.NOT_STARTED) session.status = SessionStatus.IN_PROGRESS
            sessions.save(session)
        }
        return VocabularyKeyAcknowledgementResponse(session.id, session.currentItemPosition, session.revision)
    }

    @Transactional
    fun recordKeyResult(sessionId: UUID, request: VocabularyKeyResultRequest) {
        val session = sessionEntityForUpdate(sessionId)
        val practice = practices.findById(session.practiceId).orElseThrow()
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(session.id)
            .associateBy(VocabularyPracticeItemEntity::id)
        val now = Instant.now()
        val changed = request.attempts.distinctBy { it.resultId ?: it.targetId ?: it.itemId }
            .map { keyAttempt ->
                if (keyAttempt.targetId == null) {
                    recordAttempt(session, sessionItems[keyAttempt.itemId], keyAttempt, request.clientResultId, now)
                } else {
                    recordTypedAttempt(session, sessionItems, keyAttempt, request.clientResultId, now)
                }
            }
            .any { it }
        if (!changed) {
            meters.counter("playsay.vocabulary.key.result", "outcome", "deduplicated").increment()
            return
        }
        meters.counter("playsay.vocabulary.key.result", "outcome", "accepted").increment()
        finishSession(session, practice.status, now)
        outcome.publishAttempt(session.ownerSubject, session, now)
    }

    private fun recordTypedAttempt(
        session: VocabularyPracticeSessionEntity,
        sessionItems: Map<UUID, VocabularyPracticeItemEntity>,
        keyAttempt: VocabularyKeyWordAttemptRequest,
        clientResultId: String,
        now: Instant,
    ): Boolean {
        val snapshot = keySnapshots.findBySessionId(session.id) ?: return false
        val targetId = keyAttempt.targetId ?: return false
        val target = keyTargets.findById(targetId).orElse(null)?.takeIf { it.snapshotId == snapshot.id } ?: return false
        if (target.targetType != keyAttempt.targetType) return false
        val authoritativeEntryIds: List<UUID> = objectMapper.readValue(target.sourceEntryIdsJson, uuidListType)
        val authoritativeItemIds: List<UUID> = objectMapper.readValue(target.sourceItemIdsJson, uuidListType)
        if (keyAttempt.sourceEntryIds.isNotEmpty() && keyAttempt.sourceEntryIds.toSet() != authoritativeEntryIds.toSet()) return false
        if (keyAttempt.sourceItemIds.isNotEmpty() && keyAttempt.sourceItemIds.toSet() != authoritativeItemIds.toSet()) return false
        val resultId = keyAttempt.resultId ?: UUID.nameUUIDFromBytes("$clientResultId:$targetId".toByteArray())
        if (keyResults.existsById(resultId)) return false
        val errors = keyAttempt.errors.coerceIn(0, 999)
        keyResults.save(
            VocabularyKeyResultEntity(
                id = resultId,
                clientResultId = clientResultId.take(128),
                sessionId = session.id,
                snapshotId = snapshot.id,
                targetId = target.id,
                ownerSubject = session.ownerSubject,
                targetType = target.targetType,
                errors = errors,
                durationMs = keyAttempt.durationMs.coerceIn(0, 3_600_000),
                position = keyAttempt.position.coerceAtLeast(0),
                typedText = keyAttempt.typedText?.take(200),
                sourceEntryIdsJson = target.sourceEntryIdsJson,
                sourceItemIdsJson = target.sourceItemIdsJson,
                createdAt = now,
            ),
        )
        authoritativeEntryIds.forEach { entryId ->
            val itemId = authoritativeItemIds.firstOrNull { itemId -> sessionItems[itemId]?.entryId == entryId }
            val wholeWord = target.targetType == VocabularyKeyTargetType.WHOLE_WORD
            val rating = if (errors == 0) PracticeRating.GOOD else PracticeRating.AGAIN
            val scheduleCredit = wholeWord && itemId != null &&
                !attempts.hasScheduleCredit(session.id, entryId, VocabularySkill.SPELLING)
            learningEvidence.record(
                VocabularyEvidenceCommand(
                    ownerSubject = session.ownerSubject,
                    entryId = entryId,
                    clientEvidenceId = "key-target:$resultId:$entryId",
                    evidenceType = VocabularyEvidenceType.KEY_TARGET,
                    skill = VocabularySkill.SPELLING.takeIf { wholeWord },
                    exerciseType = sessionItems[itemId]?.exerciseType,
                    sessionId = session.id,
                    itemId = itemId,
                    answerText = keyAttempt.typedText,
                    correct = errors == 0,
                    rating = rating.takeIf { wholeWord },
                    durationMs = keyAttempt.durationMs,
                    scheduleCredit = scheduleCredit,
                    occurredAt = now,
                    payloadJson = objectMapper.writeValueAsString(
                        mapOf("errors" to errors, "targetId" to target.id, "targetType" to target.targetType),
                    ),
                ),
            )
        }
        session.attemptCount += 1
        if (errors == 0) session.correctCount += 1
        refreshCompletedItems(snapshot.id, sessionItems.values.toList(), now)
        return true
    }

    private fun refreshCompletedItems(
        snapshotId: UUID,
        sessionItems: List<VocabularyPracticeItemEntity>,
        now: Instant,
    ) {
        val snapshotTargets = keyTargets.findAllBySnapshotIdOrderByPositionAsc(snapshotId)
        val completedTargetIds = snapshotTargets.filter { keyResults.existsByTargetId(it.id) }.mapTo(mutableSetOf()) { it.id }
        sessionItems.forEach { item ->
            val itemTargets = snapshotTargets.filter { target ->
                objectMapper.readValue<List<UUID>>(target.sourceItemIdsJson, uuidListType).contains(item.id)
            }
            val completedCount = itemTargets.count { it.id in completedTargetIds }
            item.attemptCount = completedCount
            if (itemTargets.isNotEmpty() && completedCount == itemTargets.size) item.completedAt = now
            item.updatedAt = now
        }
        items.saveAll(sessionItems)
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
        learningEvidence.record(
            VocabularyEvidenceCommand(
                ownerSubject = session.ownerSubject,
                entryId = keyAttempt.entryId,
                clientEvidenceId = "key:$clientResultId:${item.id}",
                evidenceType = VocabularyEvidenceType.KEY_TARGET,
                skill = VocabularySkill.SPELLING,
                exerciseType = item.exerciseType,
                sessionId = session.id,
                itemId = item.id,
                correct = rating == PracticeRating.GOOD,
                rating = rating,
                scheduleCredit = scheduleCreditApplied,
                occurredAt = now,
                payloadJson = "{\"errors\":${keyAttempt.errors.coerceAtLeast(0)}}",
            ),
        )
        item.attemptCount += 1
        item.completedAt = now
        item.updatedAt = now
        items.save(item)
        session.attemptCount += 1
        if (rating == PracticeRating.GOOD) session.correctCount += 1
        return true
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

private val uuidListType = object : TypeReference<List<UUID>>() {}
