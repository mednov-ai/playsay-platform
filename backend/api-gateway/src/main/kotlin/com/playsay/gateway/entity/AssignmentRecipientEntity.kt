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
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
