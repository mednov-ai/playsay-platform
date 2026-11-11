package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "lesson_material_parallel_annotation")
class LessonMaterialParallelAnnotationEntity(
    @Id @Column(name = "id", nullable = false) var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false) var lessonId: UUID = UUID.randomUUID(),
    @Column(name = "material_id", nullable = false) var materialId: UUID = UUID.randomUUID(),
    @Column(name = "student_user_id", nullable = false) var studentUserId: UUID = UUID.randomUUID(),
    @Column(name = "content", nullable = false, columnDefinition = "TEXT") var content: String = "{}",
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.EPOCH,
)
