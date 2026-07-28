package com.playsay.vocabulary.repo

import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyLessonAccessProjection
import com.playsay.vocabulary.entity.VocabularyUserProjection
import com.playsay.vocabulary.entity.VocabularyLessonParticipantProjection
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import java.util.UUID

interface VocabularyEntryRepo : JpaRepository<VocabularyEntryEntity, UUID> {
    fun deleteByOwnerSubject(ownerSubject: String): Long
    fun findByOwnerSubjectAndNormalizedSourceAndSourceLanguageAndTargetLanguage(ownerSubject: String, normalizedSource: String, sourceLanguage: String, targetLanguage: String): VocabularyEntryEntity?
    fun findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(ownerSubject: String, status: EntryStatus): List<VocabularyEntryEntity>
    fun findByIdAndOwnerSubject(id: UUID, ownerSubject: String): VocabularyEntryEntity?
}

interface VocabularyUserRepo : JpaRepository<VocabularyUserProjection, UUID> {
    fun findByKeycloakSubject(keycloakSubject: String): VocabularyUserProjection?
}

interface VocabularyLessonParticipantRepo : JpaRepository<VocabularyLessonParticipantProjection, UUID> {
    fun existsByLessonIdAndStudentUserId(lessonId: UUID, studentUserId: UUID): Boolean
}

interface VocabularyLessonAccessRepo : JpaRepository<VocabularyLessonAccessProjection, UUID> {
    @Query(
        value = """
            select case when count(*) > 0 then true else false end
              from lesson l
             where l.id = :lessonId
               and (
                    l.teacher_user_id = :teacherUserId
                    or exists (
                        select 1
                          from teacher_delegation d
                          join teacher_delegation_student ds on ds.delegation_id = d.id
                         where d.primary_teacher_user_id = l.teacher_user_id
                           and d.delegate_teacher_user_id = :teacherUserId
                           and ds.student_user_id = :studentUserId
                           and d.revoked_at is null
                           and d.starts_at <= coalesce(l.scheduled_start, current_timestamp)
                           and d.ends_at >= coalesce(l.scheduled_end, current_timestamp)
                    )
               )
        """,
        nativeQuery = true,
    )
    fun canTeacherAccessLessonStudent(
        lessonId: UUID,
        teacherUserId: UUID,
        studentUserId: UUID,
    ): Boolean
}
