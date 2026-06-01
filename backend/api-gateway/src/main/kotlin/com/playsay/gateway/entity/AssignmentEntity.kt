package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "assignment")
class AssignmentEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_template_id")
    var lessonTemplateId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lesson_template_id", insertable = false, updatable = false)
    var lessonTemplate: LessonTemplateEntity? = null,
    @Column(name = "lesson_id")
    var lessonId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lesson_id", insertable = false, updatable = false)
    var lesson: LessonEntity? = null,
    @Column(name = "teacher_user_id")
    var teacherUserId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "teacher_user_id", insertable = false, updatable = false)
    var teacherUser: AppUserEntity? = null,
    @Column(name = "source_lesson_id")
    var sourceLessonId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_lesson_id", insertable = false, updatable = false)
    var sourceLesson: LessonEntity? = null,
    @Column(name = "material_id")
    var materialId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "material_id", insertable = false, updatable = false)
    var material: LessonMaterialEntity? = null,
    @Column(name = "material_block_id", length = 120)
    var materialBlockId: String? = null,
    @Column(name = "title", nullable = false, length = 160)
    var title: String = "",
    @Column(name = "instructions", columnDefinition = "TEXT")
    var instructions: String? = null,
    @Column(name = "type", nullable = false, length = 48)
    var type: String = "",
    @Column(name = "payload", columnDefinition = "TEXT")
    var payload: String? = null,
    @Column(name = "max_score", precision = 6, scale = 2)
    var maxScore: BigDecimal? = null,
    @Column(name = "due_at")
    var dueAt: Instant? = null,
    @Column(name = "status", nullable = false, length = 24)
    var status: String = "ACTIVE",
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
