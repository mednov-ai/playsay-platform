package com.playsay.vocabulary.entity

import com.playsay.vocabulary.dto.LearningStage
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.PracticeExerciseType
import com.playsay.vocabulary.dto.PracticeMode
import com.playsay.vocabulary.dto.PracticeRating
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import com.playsay.vocabulary.dto.VocabularySkill
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
    @Column(name = "started_at") var startedAt: Instant? = null,
    @Column(name = "completed_at") var completedAt: Instant? = null,
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
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)
