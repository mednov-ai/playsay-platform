package com.playsay.vocabulary.entity

import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.VocabularyEvidenceType
import com.playsay.vocabulary.dto.VocabularySkill
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.time.Instant
import java.util.UUID

@Entity
@Table(
    name = "vocabulary_learning_evidence",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_evidence_owner_client", columnNames = ["owner_subject", "client_evidence_id"])],
)
class VocabularyLearningEvidenceEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @Column(name = "entry_id", nullable = false) var entryId: UUID = UUID.randomUUID(),
    @Column(name = "session_id") var sessionId: UUID? = null,
    @Column(name = "item_id") var itemId: UUID? = null,
    @Column(name = "client_evidence_id", nullable = false, length = 128) var clientEvidenceId: String = "",
    @Enumerated(EnumType.STRING) @Column(name = "evidence_type", nullable = false, length = 32) var evidenceType: VocabularyEvidenceType = VocabularyEvidenceType.RETRIEVAL,
    @Enumerated(EnumType.STRING) @Column(length = 24) var skill: VocabularySkill? = null,
    @Enumerated(EnumType.STRING) @Column(name = "exercise_type", length = 32) var exerciseType: PracticeExerciseType? = null,
    @Column(name = "answer_text", columnDefinition = "TEXT") var answerText: String? = null,
    @Column var correct: Boolean? = null,
    @Enumerated(EnumType.STRING) @Column(length = 16) var rating: PracticeRating? = null,
    @Column(name = "hints_used", nullable = false) var hintsUsed: Int = 0,
    @Column(name = "duration_ms", nullable = false) var durationMs: Long = 0,
    @Column(name = "algorithm_version", nullable = false, length = 64) var algorithmVersion: String = "legacy-v1",
    @Column(name = "evaluator_version", nullable = false, length = 64) var evaluatorVersion: String = "deterministic-v2",
    @Column(name = "scheduler_version", nullable = false, length = 64) var schedulerVersion: String = "legacy-v1",
    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT") var payloadJson: String = "{}",
    @Column(name = "occurred_at", nullable = false) var occurredAt: Instant = Instant.now(),
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)

@Entity
@Table(
    name = "vocabulary_projection_queue",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_projection_evidence", columnNames = ["evidence_id"])],
)
class VocabularyProjectionQueueEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "evidence_id", nullable = false) var evidenceId: UUID = UUID.randomUUID(),
    @Column(name = "entry_id", nullable = false) var entryId: UUID = UUID.randomUUID(),
    @Enumerated(EnumType.STRING) @Column(length = 24) var skill: VocabularySkill? = null,
    @Column(nullable = false, length = 24) var status: String = "PENDING",
    @Column(name = "attempt_count", nullable = false) var attemptCount: Int = 0,
    @Column(name = "next_attempt_at", nullable = false) var nextAttemptAt: Instant = Instant.now(),
    @Column(name = "last_error", length = 240) var lastError: String? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
