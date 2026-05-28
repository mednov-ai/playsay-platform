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
@Table(name = "submission")
class SubmissionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "assignment_id", nullable = false)
    var assignmentId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignment_id", nullable = false, insertable = false, updatable = false)
    var assignment: AssignmentEntity? = null,
    @Column(name = "student_user_id", nullable = false)
    var studentUserId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_user_id", nullable = false, insertable = false, updatable = false)
    var studentUser: AppUserEntity? = null,
    @Column(name = "lesson_id")
    var lessonId: UUID? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lesson_id", insertable = false, updatable = false)
    var lesson: LessonEntity? = null,
    @Column(name = "yjs_document_id", length = 255)
    var yjsDocumentId: String? = null,
    @Column(name = "content", columnDefinition = "TEXT")
    var content: String? = null,
    @Column(name = "score", precision = 6, scale = 2)
    var score: BigDecimal? = null,
    @Column(name = "errors_count")
    var errorsCount: Int? = null,
    @Column(name = "submitted_at")
    var submittedAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
