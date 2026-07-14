package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "teacher_delegation_student")
class TeacherDelegationStudentEntity(
    @Id @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "delegation_id", nullable = false)
    var delegationId: UUID = UUID.randomUUID(),
    @Column(name = "student_user_id", nullable = false)
    var studentUserId: UUID = UUID.randomUUID(),
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
)
