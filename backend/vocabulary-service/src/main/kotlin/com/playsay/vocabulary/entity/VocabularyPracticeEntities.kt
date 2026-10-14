package com.playsay.vocabulary.entity

import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeMode
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularySkill
import com.playsay.vocabulary.dto.VocabularyHomeworkCompletionPolicy
import com.playsay.vocabulary.dto.VocabularyKeyMode
import com.playsay.vocabulary.dto.VocabularyKeyTargetType
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.time.Instant
import java.math.BigDecimal
import java.util.UUID

@Entity
@Table(
    name = "vocabulary_skill_states",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_entry_skill", columnNames = ["entry_id", "skill"])],
)
class VocabularySkillStateEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "entry_id", nullable = false) var entryId: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entry_id", insertable = false, updatable = false)
    var entry: VocabularyEntryEntity? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var skill: VocabularySkill = VocabularySkill.MEANING,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var stage: LearningStage = LearningStage.NEW,
    @Column(name = "interval_index", nullable = false) var intervalIndex: Int = 0,
    @Column(name = "due_at", nullable = false) var dueAt: Instant = Instant.now(),
    @Column(name = "success_streak", nullable = false) var successStreak: Int = 0,
    @Column(name = "lapse_count", nullable = false) var lapseCount: Int = 0,
    @Enumerated(EnumType.STRING) @Column(name = "last_rating", length = 16) var lastRating: PracticeRating? = null,
    @Column(name = "last_practiced_at") var lastPracticedAt: Instant? = null,
    @Column(name = "policy_version", nullable = false, length = 64) var policyVersion: String = "legacy-v1",
    @Column(name = "evidence_watermark") var evidenceWatermark: UUID? = null,
    @Column(name = "difficulty_score", nullable = false, precision = 8, scale = 4) var difficultyScore: BigDecimal = BigDecimal.ZERO,
    @Column(name = "review_reason", nullable = false, length = 32) var reviewReason: String = "NEW",
    @Column(name = "skill_available", nullable = false) var skillAvailable: Boolean = true,
    @Column(name = "last_evidence_at") var lastEvidenceAt: Instant? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

@Entity
@Table(name = "vocabulary_practices")
class VocabularyPracticeEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "created_by_subject", nullable = false, length = 255) var createdBySubject: String = "",
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var delivery: PracticeDelivery = PracticeDelivery.SELF,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var status: PracticeStatus = PracticeStatus.PUBLISHED,
    @Column(name = "lesson_id") var lessonId: UUID? = null,
    @Column(name = "assignment_id") var assignmentId: UUID? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var mode: PracticeMode = PracticeMode.BALANCED,
    @Column(name = "settings_json", nullable = false, columnDefinition = "TEXT") var settingsJson: String = "{}",
    @Enumerated(EnumType.STRING) @Column(name = "completion_policy", nullable = false, length = 32) var completionPolicy: VocabularyHomeworkCompletionPolicy = VocabularyHomeworkCompletionPolicy.COMPLETE_SESSION,
    @Column(name = "completion_policy_version", nullable = false, length = 64) var completionPolicyVersion: String = "legacy-v1",
    @Column(name = "completion_thresholds_json", nullable = false, columnDefinition = "TEXT") var completionThresholdsJson: String = "{}",
    @Enumerated(EnumType.STRING) @Column(name = "key_mode", nullable = false, length = 32) var keyMode: VocabularyKeyMode = VocabularyKeyMode.WHOLE_WORDS,
    @Column(name = "key_ngram_settings_json", nullable = false, columnDefinition = "TEXT") var keyNgramSettingsJson: String = "{}",
    @Column(name = "key_materializer_version", nullable = false, length = 64) var keyMaterializerVersion: String = "vocabulary-key-v1",
    @Column(name = "key_materializer_seed", nullable = false) var keyMaterializerSeed: Long = 0,
    @Column(name = "started_at") var startedAt: Instant? = null,
    @Column(name = "completed_at") var completedAt: Instant? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

@Entity
@Table(
    name = "vocabulary_key_snapshots",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_key_snapshot_session", columnNames = ["session_id"])],
)
class VocabularyKeySnapshotEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "session_id", nullable = false) var sessionId: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) var mode: VocabularyKeyMode = VocabularyKeyMode.WHOLE_WORDS,
    @Column(nullable = false, length = 8) var layout: String = "EN",
    @Column(name = "ngram_settings_json", nullable = false, columnDefinition = "TEXT") var ngramSettingsJson: String = "{}",
    @Column(name = "materializer_version", nullable = false, length = 64) var materializerVersion: String = "vocabulary-key-v1",
    @Column(name = "materializer_seed", nullable = false) var materializerSeed: Long = 0,
    @Column(name = "completion_context_json", nullable = false, columnDefinition = "TEXT") var completionContextJson: String = "{}",
    @Column(name = "return_context_json", nullable = false, columnDefinition = "TEXT") var returnContextJson: String = "{}",
    @Column(name = "expires_at", nullable = false) var expiresAt: Instant = Instant.now(),
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)

@Entity
@Table(
    name = "vocabulary_key_targets",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_key_target_position", columnNames = ["snapshot_id", "position"])],
)
class VocabularyKeyTargetEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "snapshot_id", nullable = false) var snapshotId: UUID = UUID.randomUUID(),
    @Column(nullable = false) var position: Int = 0,
    @Enumerated(EnumType.STRING) @Column(name = "target_type", nullable = false, length = 32) var targetType: VocabularyKeyTargetType = VocabularyKeyTargetType.WHOLE_WORD,
    @Column(nullable = false, length = 255) var text: String = "",
    @Column(name = "source_entry_ids_json", nullable = false, columnDefinition = "TEXT") var sourceEntryIdsJson: String = "[]",
    @Column(name = "source_item_ids_json", nullable = false, columnDefinition = "TEXT") var sourceItemIdsJson: String = "[]",
    @Column(name = "offsets_json", nullable = false, columnDefinition = "TEXT") var offsetsJson: String = "[]",
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)

@Entity
@Table(name = "vocabulary_key_results")
class VocabularyKeyResultEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "client_result_id", nullable = false, length = 128) var clientResultId: String = "",
    @Column(name = "session_id", nullable = false) var sessionId: UUID = UUID.randomUUID(),
    @Column(name = "snapshot_id", nullable = false) var snapshotId: UUID = UUID.randomUUID(),
    @Column(name = "target_id", nullable = false) var targetId: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @Enumerated(EnumType.STRING) @Column(name = "target_type", nullable = false, length = 32) var targetType: VocabularyKeyTargetType = VocabularyKeyTargetType.WHOLE_WORD,
    @Column(nullable = false) var errors: Int = 0,
    @Column(name = "duration_ms", nullable = false) var durationMs: Long = 0,
    @Column(nullable = false) var position: Int = 0,
    @Column(name = "typed_text", length = 200) var typedText: String? = null,
    @Column(name = "source_entry_ids_json", nullable = false, columnDefinition = "TEXT") var sourceEntryIdsJson: String = "[]",
    @Column(name = "source_item_ids_json", nullable = false, columnDefinition = "TEXT") var sourceItemIdsJson: String = "[]",
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)

@Entity
@Table(name = "vocabulary_practice_plans")
class VocabularyPracticePlanEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "created_by_subject", nullable = false, length = 255) var createdBySubject: String = "",
    @Column(nullable = false) var revision: Long = 1,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var delivery: PracticeDelivery = PracticeDelivery.SELF,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var mode: PracticeMode = PracticeMode.BALANCED,
    @Column(name = "lesson_id") var lessonId: UUID? = null,
    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT") var payloadJson: String = "{}",
    @Column(name = "expires_at", nullable = false) var expiresAt: Instant = Instant.now(),
    @Column(name = "published_practice_id") var publishedPracticeId: UUID? = null,
    @Column(name = "recipe_id") var recipeId: UUID? = null,
    @Column(name = "selection_reasons_json", nullable = false, columnDefinition = "TEXT") var selectionReasonsJson: String = "{}",
    @Column(name = "exclusions_json", nullable = false, columnDefinition = "TEXT") var exclusionsJson: String = "[]",
    @Column(name = "eligibility_watermark") var eligibilityWatermark: Instant? = null,
    @Column(name = "materialization_seed", nullable = false) var materializationSeed: Long = 0,
    @Column(name = "policy_versions_json", nullable = false, columnDefinition = "TEXT") var policyVersionsJson: String = "{}",
    @Column(name = "content_revision_ids_json", nullable = false, columnDefinition = "TEXT") var contentRevisionIdsJson: String = "[]",
    @Column(name = "materialization_key", length = 128) var materializationKey: String? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

@Entity
@Table(
    name = "vocabulary_practice_sessions",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_practice_owner", columnNames = ["practice_id", "owner_subject"])],
)
class VocabularyPracticeSessionEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "practice_id", nullable = false) var practiceId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "practice_id", insertable = false, updatable = false)
    var practice: VocabularyPracticeEntity? = null,
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var status: SessionStatus = SessionStatus.NOT_STARTED,
    @Column(name = "current_item_position", nullable = false) var currentItemPosition: Int = 0,
    @Column(name = "attempt_sequence", nullable = false) var attemptSequence: Int = 0,
    @Column(nullable = false) var revision: Long = 0,
    @Column(name = "correct_count", nullable = false) var correctCount: Int = 0,
    @Column(name = "attempt_count", nullable = false) var attemptCount: Int = 0,
    @Column(name = "teacher_hint", columnDefinition = "TEXT") var teacherHint: String? = null,
    @Column(name = "help_requested", nullable = false) var helpRequested: Boolean = false,
    @Column(name = "started_at") var startedAt: Instant? = null,
    @Column(name = "completed_at") var completedAt: Instant? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

@Entity
@Table(
    name = "vocabulary_practice_items",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_session_position", columnNames = ["session_id", "position"])],
)
class VocabularyPracticeItemEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "session_id", nullable = false) var sessionId: UUID = UUID.randomUUID(),
    @Column(name = "entry_id") var entryId: UUID? = null,
    @Column(nullable = false) var position: Int = 0,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var skill: VocabularySkill = VocabularySkill.MEANING,
    @Enumerated(EnumType.STRING) @Column(name = "exercise_type", nullable = false, length = 32) var exerciseType: PracticeExerciseType = PracticeExerciseType.FLASHCARD,
    @Column(nullable = false, columnDefinition = "TEXT") var prompt: String = "",
    @Column(nullable = false, columnDefinition = "TEXT") var answer: String = "",
    @Column(name = "options_json", nullable = false, columnDefinition = "TEXT") var optionsJson: String = "[]",
    @Column(name = "schema_version", nullable = false) var schemaVersion: Int = 1,
    @Column(name = "accepted_answers_json", nullable = false, columnDefinition = "TEXT") var acceptedAnswersJson: String = "[]",
    @Column(name = "content_json", nullable = false, columnDefinition = "TEXT") var contentJson: String = "{}",
    @Column(name = "affects_schedule", nullable = false) var affectsSchedule: Boolean = true,
    @Column(name = "lexical_content_revision_id") var lexicalContentRevisionId: UUID? = null,
    @Column(name = "snapshot_json", nullable = false, columnDefinition = "TEXT") var snapshotJson: String = "{}",
    @Column(name = "attempt_count", nullable = false) var attemptCount: Int = 0,
    @Column(name = "retry_after_sequence", nullable = false) var retryAfterSequence: Int = 0,
    @Column(name = "completed_at") var completedAt: Instant? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

@Entity
@Table(
    name = "vocabulary_practice_attempts",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_owner_attempt", columnNames = ["owner_subject", "client_attempt_id"])],
)
class VocabularyPracticeAttemptEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "session_id", nullable = false) var sessionId: UUID = UUID.randomUUID(),
    @Column(name = "item_id", nullable = false) var itemId: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @Column(name = "client_attempt_id", nullable = false, length = 128) var clientAttemptId: String = "",
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) var rating: PracticeRating = PracticeRating.AGAIN,
    @Column(name = "answer_text", columnDefinition = "TEXT") var answerText: String? = null,
    @Column(nullable = false) var correct: Boolean = false,
    @Column(name = "hints_used", nullable = false) var hintsUsed: Int = 0,
    @Column(name = "duration_ms", nullable = false) var durationMs: Long = 0,
    @Column(name = "schedule_credit_applied", nullable = false) var scheduleCreditApplied: Boolean = false,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)
