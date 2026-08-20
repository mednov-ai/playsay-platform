package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID
import java.math.BigDecimal

@Entity
@Table(name = "assignment_recipient")
class AssignmentRecipientEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "assignment_id", nullable = false)
    var assignmentId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignment_id", nullable = false, insertable = false, updatable = false)
    var assignment: AssignmentEntity? = null,
    @Column(name = "student_user_id", nullable = false)
    var studentUserId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_user_id", nullable = false, insertable = false, updatable = false)
    var studentUser: AppUserEntity? = null,
    @Column(name = "assigned_at", nullable = false)
    var assignedAt: Instant = Instant.EPOCH,
    @Column(name = "due_at")
    var dueAt: Instant? = null,
    @Column(name = "archived_at")
    var archivedAt: Instant? = null,
    @Column(name = "activity_ref")
    var activityRef: UUID? = null,
    @Column(name = "activity_state", nullable = false, length = 24)
    var activityState: String = "NOT_STARTED",
    @Column(name = "completion_ratio", precision = 7, scale = 4)
    var completionRatio: BigDecimal? = null,
    @Column(precision = 7, scale = 4)
    var accuracy: BigDecimal? = null,
    @Column(name = "difficult_word_count")
    var difficultWordCount: Int? = null,
    @Column(name = "activity_revision", nullable = false)
    var activityRevision: Long = 0,
    @Column(name = "activity_updated_at")
    var activityUpdatedAt: Instant? = null,
    @Column(name = "learner_snapshot_id")
    var learnerSnapshotId: UUID? = null,
    @Column(name = "distinct_graded_prompts")
    var distinctGradedPrompts: Int? = null,
    @Column(name = "distinct_entries")
    var distinctEntries: Int? = null,
    @Column(name = "hints_used")
    var hintsUsed: Int? = null,
    @Column(name = "active_duration_ms")
    var activeDurationMs: Long? = null,
    @Column(name = "mastery_ratio", precision = 7, scale = 4)
    var masteryRatio: BigDecimal? = null,
    @Column(name = "review_state", length = 24)
    var reviewState: String? = null,
    @Column(name = "review_note", columnDefinition = "TEXT")
    var reviewNote: String? = null,
    @Column(name = "reviewed_at")
    var reviewedAt: Instant? = null,
    @Column(name = "reviewed_by_subject", length = 255)
    var reviewedBySubject: String? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
