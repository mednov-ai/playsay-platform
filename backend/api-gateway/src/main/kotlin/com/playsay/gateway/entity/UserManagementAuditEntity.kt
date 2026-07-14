package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "user_management_audit")
class UserManagementAuditEntity(
    @Id @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "actor_user_id", nullable = false)
    var actorUserId: UUID = UUID.randomUUID(),
    @Column(name = "action", nullable = false, length = 80)
    var action: String = "",
    @Column(name = "target_subject", length = 255)
    var targetSubject: String? = null,
    @Column(name = "details", nullable = false, columnDefinition = "TEXT")
    var details: String = "{}",
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
)
