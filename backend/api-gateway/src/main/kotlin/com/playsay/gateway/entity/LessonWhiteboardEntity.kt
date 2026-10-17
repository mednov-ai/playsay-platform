package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

// JPA keeps mapped columns explicit in the entity constructor.
@Suppress("LongParameterList")
@Entity
@Table(name = "lesson_whiteboard")
class LessonWhiteboardEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false) var lessonId: UUID = UUID.randomUUID(),
    @Column(name = "student_user_id") var studentUserId: UUID? = null,
    @Column(name = "context_key", nullable = false) var contextKey: String = "GROUP",
    @Column(name = "document_id", nullable = false, unique = true) var documentId: UUID = UUID.randomUUID(),
    @Column(nullable = false) var background: String = "#ffffff",
    @Column(name = "learner_ink_enabled", nullable = false) var learnerInkEnabled: Boolean = false,
    @Column(name = "content_epoch", nullable = false) var contentEpoch: Long = 0,
    @Column(name = "control_revision", nullable = false) var controlRevision: Long = 0,
    @Column(name = "active_surface", nullable = false) var activeSurface: String = "MATERIAL",
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.EPOCH,
)
