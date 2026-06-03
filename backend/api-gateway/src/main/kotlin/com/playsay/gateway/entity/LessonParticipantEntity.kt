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
@Table(name = "lesson_participant")
class LessonParticipantEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false)
    var lessonId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lesson_id", nullable = false, insertable = false, updatable = false)
    var lesson: LessonEntity? = null,
    @Column(name = "student_user_id", nullable = false)
    var studentUserId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_user_id", nullable = false, insertable = false, updatable = false)
    var studentUser: AppUserEntity? = null,
    @Column(name = "material_id")
    var materialId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "material_id", insertable = false, updatable = false)
    var material: LessonMaterialEntity? = null,
    @Column(name = "joined_at")
    var joinedAt: Instant? = null,
    @Column(name = "left_at")
    var leftAt: Instant? = null,
    @Column(name = "attendance_status", length = 32)
    var attendanceStatus: String? = null,
)
