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
@Table(name = "lesson")
class LessonEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_template_id")
    var lessonTemplateId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lesson_template_id", insertable = false, updatable = false)
    var lessonTemplate: LessonTemplateEntity? = null,
    @Column(name = "material_id")
    var materialId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "material_id", insertable = false, updatable = false)
    var material: LessonMaterialEntity? = null,
    @Column(name = "teacher_user_id")
    var teacherUserId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "teacher_user_id", insertable = false, updatable = false)
    var teacherUser: AppUserEntity? = null,
    @Column(name = "scheduled_start")
    var scheduledStart: Instant? = null,
    @Column(name = "scheduled_end")
    var scheduledEnd: Instant? = null,
    @Column(name = "actual_start")
    var actualStart: Instant? = null,
    @Column(name = "actual_end")
    var actualEnd: Instant? = null,
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "",
    @Column(name = "type", nullable = false, length = 32)
    var type: String = "",
    @Column(name = "livekit_room_name", length = 255)
    var livekitRoomName: String? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
