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
@Table(name = "course")
class CourseEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "title", nullable = false, length = 160)
    var title: String = "",
    @Column(name = "description", columnDefinition = "TEXT")
    var description: String? = null,
    @Column(name = "level", length = 16)
    var level: String? = null,
    @Column(name = "language", nullable = false, length = 16)
    var language: String = "en",
    @Column(name = "created_by_user_id")
    var createdByUserId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", insertable = false, updatable = false)
    var createdByUser: AppUserEntity? = null,
    @Column(name = "is_published", nullable = false)
    var isPublished: Boolean = false,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
