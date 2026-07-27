package com.playsay.gateway.repo

import com.playsay.gateway.entity.CollaborationDocumentEntity
import java.util.UUID
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface CollaborationDocumentRepo : JpaRepository<CollaborationDocumentEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select document from CollaborationDocumentEntity document where document.id = :id")
    fun findByIdForUpdate(@Param("id") id: UUID): CollaborationDocumentEntity?

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
