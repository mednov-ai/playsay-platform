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
@Table(name = "lesson_material")
class LessonMaterialEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "owner_teacher_user_id")
    var ownerTeacherUserId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_teacher_user_id", insertable = false, updatable = false)
    var ownerTeacherUser: AppUserEntity? = null,
    @Column(name = "title", nullable = false, length = 160)
    var title: String = "",
    @Column(name = "description", columnDefinition = "TEXT")
    var description: String? = null,
    @Column(name = "language", nullable = false, length = 16)
    var language: String = "en",
    @Column(name = "cefr_level", nullable = false, length = 8)
    var cefrLevel: String = "",
    @Column(name = "visibility", nullable = false, length = 16)
    var visibility: String = "",
    @Column(name = "status", nullable = false, length = 32)
    var status: String = "",
    @Column(name = "document", nullable = false, columnDefinition = "TEXT")
    var document: String = "{}",
    @Column(name = "source_meta", nullable = false, columnDefinition = "TEXT")
    var sourceMeta: String = "{}",
    @Column(name = "scoring_rubric", nullable = false, columnDefinition = "TEXT")
    var scoringRubric: String = "{}",
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
