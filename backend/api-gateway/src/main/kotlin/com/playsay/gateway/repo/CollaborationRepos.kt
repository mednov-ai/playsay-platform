package com.playsay.gateway.repo

import com.playsay.gateway.entity.CollaborationDocumentEntity
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface CollaborationDocumentRepo : JpaRepository<CollaborationDocumentEntity, UUID> {
    fun findByLessonIdAndMaterialIdAndStudentUserIdAndDocumentKindAndCollaborationScope(
        lessonId: UUID,
        materialId: UUID,
        studentUserId: UUID,
        documentKind: String,
        collaborationScope: String,
    ): CollaborationDocumentEntity?

    fun findByLessonIdAndMaterialIdAndStudentUserIdIsNullAndDocumentKindAndCollaborationScope(
        lessonId: UUID,
        materialId: UUID,
        documentKind: String,
        collaborationScope: String,
    ): CollaborationDocumentEntity?

    fun findByLessonIdAndMaterialIdOrderByUpdatedAtDesc(
        lessonId: UUID,
        materialId: UUID,
    ): List<CollaborationDocumentEntity>
}
