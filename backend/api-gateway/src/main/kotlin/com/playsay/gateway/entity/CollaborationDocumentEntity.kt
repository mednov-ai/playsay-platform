package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "collaboration_document")
class CollaborationDocumentEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false)
    var lessonId: UUID = UUID.randomUUID(),
    @Column(name = "material_id", nullable = false)
    var materialId: UUID = UUID.randomUUID(),
    @Column(name = "student_user_id")
    var studentUserId: UUID? = null,
    @Column(name = "document_kind", nullable = false, length = 40)
    var documentKind: String = "",
    @Column(name = "collaboration_scope", nullable = false, length = 20)
    var collaborationScope: String = "",
    @Column(name = "yjs_document_id", nullable = false, unique = true, length = 200)
    var yjsDocumentId: String = "",
    @Column(name = "snapshot_json", columnDefinition = "TEXT")
    var snapshotJson: String? = null,
    @Column(name = "snapshot_storage_key", columnDefinition = "TEXT")
    var snapshotStorageKey: String? = null,
    @Column(name = "version", nullable = false)
    var version: Long = 0,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
