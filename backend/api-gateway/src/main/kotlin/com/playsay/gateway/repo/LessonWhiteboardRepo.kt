package com.playsay.gateway.repo

import com.playsay.gateway.entity.LessonWhiteboardEntity
import jakarta.persistence.LockModeType
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

interface LessonWhiteboardRepo : JpaRepository<LessonWhiteboardEntity, UUID> {
    fun findByLessonIdAndContextKey(lessonId: UUID, contextKey: String): LessonWhiteboardEntity?
    fun findByDocumentId(documentId: UUID): LessonWhiteboardEntity?
    fun findByLessonId(lessonId: UUID): List<LessonWhiteboardEntity>
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from LessonWhiteboardEntity b where b.id = :id")
    fun lockById(id: UUID): LessonWhiteboardEntity?
}
