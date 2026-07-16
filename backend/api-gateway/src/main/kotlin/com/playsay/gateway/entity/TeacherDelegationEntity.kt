package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "teacher_delegation")
class TeacherDelegationEntity(
    @Id @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "primary_teacher_user_id", nullable = false)
    var primaryTeacherUserId: UUID = UUID.randomUUID(),
    @Column(name = "delegate_teacher_user_id", nullable = false)
    var delegateTeacherUserId: UUID = UUID.randomUUID(),
    @Column(name = "starts_at", nullable = false)
    var startsAt: Instant = Instant.EPOCH,
    @Column(name = "ends_at", nullable = false)
    var endsAt: Instant = Instant.EPOCH,
    @Column(name = "source_kind", nullable = false, length = 24)
    var sourceKind: String = "MANUAL",
    @Column(name = "source_id")
    var sourceId: UUID? = null,
    @Column(name = "created_by_user_id", nullable = false)
    var createdByUserId: UUID = UUID.randomUUID(),
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "revoked_at")
    var revokedAt: Instant? = null,
    @Column(name = "revoked_by_user_id")
    var revokedByUserId: UUID? = null,
)
