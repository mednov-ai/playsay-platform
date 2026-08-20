package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularyEvidenceType
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.entity.VocabularyLearningEvidenceEntity
import com.playsay.vocabulary.entity.VocabularyProjectionQueueEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.repo.VocabularyLearningEvidenceRepo
import com.playsay.vocabulary.repo.VocabularyProjectionQueueRepo
import com.playsay.vocabulary.repo.VocabularySkillStateRepo
import io.micrometer.core.instrument.MeterRegistry
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class VocabularyEvidenceCommand(
    val ownerSubject: String,
    val entryId: UUID,
    val clientEvidenceId: String,
    val evidenceType: VocabularyEvidenceType,
    val skill: VocabularySkill? = null,
    val exerciseType: PracticeExerciseType? = null,
    val sessionId: UUID? = null,
    val itemId: UUID? = null,
    val answerText: String? = null,
    val correct: Boolean? = null,
    val rating: PracticeRating? = null,
    val hintsUsed: Int = 0,
    val durationMs: Long = 0,
    val scheduleCredit: Boolean = false,
    val occurredAt: Instant = Instant.now(),
    val payloadJson: String = "{}",
)

@Service
class VocabularyLearningEvidenceService(
    private val evidenceRepo: VocabularyLearningEvidenceRepo,
    private val queueRepo: VocabularyProjectionQueueRepo,
    private val policies: VocabularySchedulingPolicyRegistry,
    private val projector: VocabularyMemoryProjector,
    private val meters: MeterRegistry,
) {
    @Transactional
    fun record(command: VocabularyEvidenceCommand): VocabularyLearningEvidenceEntity {
        val clientId = command.clientEvidenceId.trim().take(128)
        require(clientId.isNotEmpty()) { "clientEvidenceId must not be blank" }
        evidenceRepo.findByOwnerSubjectAndClientEvidenceId(command.ownerSubject, clientId)?.let { return it }
        val schedulerVersion = policies.versionForNewEvidence()
        val now = Instant.now()
        val evidence = evidenceRepo.save(
            VocabularyLearningEvidenceEntity(
                ownerSubject = command.ownerSubject,
                entryId = command.entryId,
                sessionId = command.sessionId,
                itemId = command.itemId,
                clientEvidenceId = clientId,
                evidenceType = command.evidenceType,
                skill = command.skill,
                exerciseType = command.exerciseType,
                answerText = command.answerText?.take(2_000),
                correct = command.correct,
                rating = command.rating,
                hintsUsed = command.hintsUsed.coerceIn(0, 100),
                durationMs = command.durationMs.coerceIn(0, 3_600_000),
                algorithmVersion = "evidence-v1",
                evaluatorVersion = "deterministic-v2",
                schedulerVersion = schedulerVersion,
                payloadJson = command.payloadJson,
                occurredAt = command.occurredAt,
                createdAt = now,
            ),
        )
        meters.counter(
            "playsay.vocabulary.evidence.accepted",
            "type",
            evidence.evidenceType.name,
            "scheduleCredit",
            command.scheduleCredit.toString(),
        ).increment()
        if (command.scheduleCredit && evidence.skill != null && evidence.rating != null) {
            val queue = queueRepo.save(
                VocabularyProjectionQueueEntity(
                    evidenceId = evidence.id,
                    entryId = evidence.entryId,
                    skill = evidence.skill,
                    status = PROJECTION_PENDING,
                    nextAttemptAt = now,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
            projector.tryProject(queue.id)
        }
        return evidence
    }
}

@Service
class VocabularyMemoryProjector(
    private val evidenceRepo: VocabularyLearningEvidenceRepo,
    private val queueRepo: VocabularyProjectionQueueRepo,
    private val states: VocabularySkillStateRepo,
    private val policies: VocabularySchedulingPolicyRegistry,
    private val shadowComparison: VocabularyPolicyShadowComparison,
    private val meters: MeterRegistry,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    fun tryProject(queueId: UUID): Boolean {
        val queue = queueRepo.findById(queueId).orElse(null) ?: return false
        if (queue.status == PROJECTION_COMPLETED) return true
        return runCatching {
            project(queue)
            true
        }.getOrElse { error ->
            val now = Instant.now()
            queue.status = PROJECTION_PENDING
            queue.attemptCount += 1
            queue.nextAttemptAt = now.plusSeconds(projectionBackoffSeconds(queue.attemptCount))
            queue.lastError = error.javaClass.simpleName.take(240)
            queue.updatedAt = now
            queueRepo.save(queue)
            meters.counter("playsay.vocabulary.projection.failures", "error", error.javaClass.simpleName).increment()
            logger.warn(
                "Vocabulary projection deferred: queueId={}, evidenceId={}, attemptCount={}, errorType={}",
                queue.id,
                queue.evidenceId,
                queue.attemptCount,
                error.javaClass.simpleName,
            )
            false
        }
    }

    private fun project(queue: VocabularyProjectionQueueEntity) {
        val evidence = evidenceRepo.findById(queue.evidenceId).orElseThrow()
        val skill = evidence.skill ?: return complete(queue)
        val rating = evidence.rating ?: return complete(queue)
        val now = Instant.now()
        val state = states.lockByEntryIdAndSkill(evidence.entryId, skill)
            ?: VocabularySkillStateEntity(
                entryId = evidence.entryId,
                ownerSubject = evidence.ownerSubject,
                skill = skill,
                dueAt = evidence.occurredAt,
                createdAt = now,
                updatedAt = now,
            )
        if (state.evidenceWatermark == evidence.id || state.lastEvidenceAt?.isAfter(evidence.occurredAt) == true) {
            return complete(queue)
        }
        shadowComparison.compare(state, VocabularySchedulingInput(rating, evidence.hintsUsed, evidence.durationMs), evidence.occurredAt)
        policies.require(evidence.schedulerVersion).apply(
            state,
            VocabularySchedulingInput(rating, evidence.hintsUsed, evidence.durationMs),
            evidence.occurredAt,
        )
        state.evidenceWatermark = evidence.id
        state.lastEvidenceAt = evidence.occurredAt
        states.save(state)
        complete(queue)
        meters.counter("playsay.vocabulary.projection.applied", "policy", evidence.schedulerVersion).increment()
        meters.timer("playsay.vocabulary.projection.lag").record(Duration.between(evidence.occurredAt, now).coerceAtLeast(Duration.ZERO))
    }

    private fun complete(queue: VocabularyProjectionQueueEntity) {
        queue.status = PROJECTION_COMPLETED
        queue.lastError = null
        queue.updatedAt = Instant.now()
        queueRepo.save(queue)
    }

    @Scheduled(fixedDelayString = "\${playsay.vocabulary.projection-retry-ms:5000}")
    @Transactional
    fun retryPending() {
        queueRepo.findTop50ByStatusAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(PROJECTION_PENDING, Instant.now())
            .forEach { tryProject(it.id) }
    }
}

@Service
class VocabularyPolicyShadowComparison(
    private val legacy: LegacyVocabularySchedulingPolicy,
    private val adaptive: AdaptiveVocabularySchedulingPolicy,
    private val meters: MeterRegistry,
) {
    fun compare(state: VocabularySkillStateEntity, input: VocabularySchedulingInput, now: Instant) {
        val legacyState = state.copyForPolicy()
        val adaptiveState = state.copyForPolicy()
        legacy.apply(legacyState, input, now)
        adaptive.apply(adaptiveState, input, now)
        meters.counter(
            "playsay.vocabulary.policy.shadow",
            "dueStatusChanged",
            (legacyState.dueAt != adaptiveState.dueAt).toString(),
            "masteryChanged",
            (legacyState.stage != adaptiveState.stage).toString(),
            "difficultyBand",
            adaptiveState.difficultyBand(),
        ).increment()
    }
}

private fun VocabularySkillStateEntity.copyForPolicy() = VocabularySkillStateEntity(
    id = id,
    entryId = entryId,
    ownerSubject = ownerSubject,
    skill = skill,
    stage = stage,
    intervalIndex = intervalIndex,
    dueAt = dueAt,
    successStreak = successStreak,
    lapseCount = lapseCount,
    lastRating = lastRating,
    lastPracticedAt = lastPracticedAt,
    policyVersion = policyVersion,
    evidenceWatermark = evidenceWatermark,
    difficultyScore = difficultyScore,
    reviewReason = reviewReason,
    skillAvailable = skillAvailable,
    lastEvidenceAt = lastEvidenceAt,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

private fun VocabularySkillStateEntity.difficultyBand(): String = when {
    difficultyScore.toDouble() >= 0.7 -> "HIGH"
    difficultyScore.toDouble() >= 0.35 -> "MEDIUM"
    else -> "LOW"
}

private fun projectionBackoffSeconds(attempt: Int): Long = (5L shl attempt.coerceIn(0, 7)).coerceAtMost(600)

private const val PROJECTION_PENDING = "PENDING"
private const val PROJECTION_COMPLETED = "COMPLETED"
