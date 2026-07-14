package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "user_deletion_operation")
class UserDeletionOperationEntity(
    @Id @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "target_user_id", nullable = false)
    var targetUserId: UUID = UUID.randomUUID(),
    @Column(name = "target_subject", nullable = false, length = 255)
    var targetSubject: String = "",
    @Column(name = "requested_by_user_id", nullable = false)
    var requestedByUserId: UUID = UUID.randomUUID(),
    @Column(name = "replacement_teacher_user_id")
    var replacementTeacherUserId: UUID? = null,
    @Column(name = "status", nullable = false, length = 24)
    var status: String = "PENDING",
    @Column(name = "error_code", length = 120)
    var errorCode: String? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
    @Column(name = "completed_at")
    var completedAt: Instant? = null,
)
