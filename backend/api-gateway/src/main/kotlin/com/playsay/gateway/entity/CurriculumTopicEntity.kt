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
@Table(name = "curriculum_topic")
class CurriculumTopicEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "course_id", nullable = false)
    var courseId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id", insertable = false, updatable = false)
    var course: CourseEntity? = null,
    @Column(name = "title", nullable = false, length = 160)
    var title: String = "",
    @Column(name = "description", columnDefinition = "TEXT")
    var description: String? = null,
    @Column(name = "order_index")
    var orderIndex: Int? = null,
    @Column(name = "tag_slugs", nullable = false, columnDefinition = "TEXT")
    var tagSlugs: String = "[]",
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
