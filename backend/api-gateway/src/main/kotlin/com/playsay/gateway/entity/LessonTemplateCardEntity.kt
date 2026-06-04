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
@Table(name = "lesson_template_card")
class LessonTemplateCardEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_template_id", nullable = false)
    var lessonTemplateId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lesson_template_id", insertable = false, updatable = false)
    var lessonTemplate: LessonTemplateEntity? = null,
    @Column(name = "material_id", nullable = false)
    var materialId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "material_id", insertable = false, updatable = false)
    var material: LessonMaterialEntity? = null,
    @Column(name = "order_index")
    var orderIndex: Int? = null,
    @Column(name = "role", nullable = false, length = 32)
    var role: String = "MAIN",
    @Column(name = "planned_duration_min")
    var plannedDurationMin: Int? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
