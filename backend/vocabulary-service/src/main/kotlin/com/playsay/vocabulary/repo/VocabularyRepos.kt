package com.playsay.vocabulary.repo

import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyLessonAccessProjection
import com.playsay.vocabulary.entity.VocabularyPracticeAttemptEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.entity.VocabularyIntegrationOutboxEntity
import com.playsay.vocabulary.entity.VocabularyUserProjection
import com.playsay.vocabulary.entity.VocabularyLessonParticipantProjection
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.jpa.repository.Lock
import jakarta.persistence.LockModeType
import java.util.UUID
import java.time.Instant

interface VocabularyEntryRepo : JpaRepository<VocabularyEntryEntity, UUID> {
    fun deleteByOwnerSubject(ownerSubject: String): Long
    fun findByOwnerSubjectAndNormalizedSourceAndSourceLanguageAndTargetLanguage(ownerSubject: String, normalizedSource: String, sourceLanguage: String, targetLanguage: String): VocabularyEntryEntity?
    fun findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(ownerSubject: String, status: EntryStatus): List<VocabularyEntryEntity>
    fun findByIdAndOwnerSubject(id: UUID, ownerSubject: String): VocabularyEntryEntity?
}

interface VocabularyUserRepo : JpaRepository<VocabularyUserProjection, UUID> {
    fun findByKeycloakSubject(keycloakSubject: String): VocabularyUserProjection?

    @Query(
        value = """
            select case when count(*) > 0 then true else false end
              from app_user learner
              join app_user actor on actor.keycloak_subject = :actorSubject
             where learner.keycloak_subject = :ownerSubject
               and (
                    learner.managed_by_teacher_user_id = actor.id
                    or exists (
                        select 1
                          from teacher_delegation d
                          join teacher_delegation_student ds on ds.delegation_id = d.id
                         where d.primary_teacher_user_id = learner.managed_by_teacher_user_id
                           and d.delegate_teacher_user_id = actor.id
                           and ds.student_user_id = learner.id
                           and d.source_kind = 'MANUAL'
                           and d.revoked_at is null
                           and d.starts_at <= current_timestamp
                           and d.ends_at >= current_timestamp
                    )
               )
        """,
        nativeQuery = true,
    )
    fun canManageVocabulary(actorSubject: String, ownerSubject: String): Boolean

    @Query(
        value = """
            select learner.*
              from app_user learner
              join app_user actor on actor.keycloak_subject = :actorSubject
             where learner.deleted_at is null
               and (
                    learner.managed_by_teacher_user_id = actor.id
                    or exists (
                        select 1
                          from teacher_delegation d
                          join teacher_delegation_student ds on ds.delegation_id = d.id
                         where d.primary_teacher_user_id = learner.managed_by_teacher_user_id
                           and d.delegate_teacher_user_id = actor.id
                           and ds.student_user_id = learner.id
                           and d.source_kind = 'MANUAL'
                           and d.revoked_at is null
                           and d.starts_at <= current_timestamp
                           and d.ends_at >= current_timestamp
                    )
               )
             order by coalesce(learner.display_name, learner.username, learner.keycloak_subject)
        """,
        nativeQuery = true,
    )
    fun findManageableLearners(actorSubject: String): List<VocabularyUserProjection>
}

interface VocabularyLessonParticipantRepo : JpaRepository<VocabularyLessonParticipantProjection, UUID> {
    fun existsByLessonIdAndStudentUserId(lessonId: UUID, studentUserId: UUID): Boolean
}

interface VocabularyLessonAccessRepo : JpaRepository<VocabularyLessonAccessProjection, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select lesson from VocabularyLessonAccessProjection lesson where lesson.id = :lessonId")
    fun lockById(lessonId: UUID): VocabularyLessonAccessProjection?

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
                           and (
                                d.source_kind = 'MANUAL'
                                or (
                                    d.source_kind = 'SCHEDULE'
                                    and d.source_id = coalesce(l.recurrence_series_id, l.id)
                                )
                           )
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

interface VocabularySkillStateRepo : JpaRepository<VocabularySkillStateEntity, UUID> {
    fun findAllByEntryIdIn(entryIds: Collection<UUID>): List<VocabularySkillStateEntity>
    fun findByEntryIdAndSkill(entryId: UUID, skill: com.playsay.vocabulary.dto.VocabularySkill): VocabularySkillStateEntity?
    fun deleteByEntryOwnerSubject(ownerSubject: String): Long
}

interface VocabularyPracticeRepo : JpaRepository<VocabularyPracticeEntity, UUID> {
    fun findFirstByLessonIdAndStatusInOrderByUpdatedAtDesc(
        lessonId: UUID,
        statuses: Collection<PracticeStatus>,
    ): VocabularyPracticeEntity?

    fun findByAssignmentId(assignmentId: UUID): VocabularyPracticeEntity?

    @Query(
        value = """
            select practice.*
              from vocabulary_practices practice
              join lesson on lesson.id = practice.lesson_id
             where practice.delivery = 'LIVE'
               and practice.status in ('PUBLISHED', 'ACTIVE', 'PAUSED')
               and lesson.status in ('COMPLETED', 'CANCELLED')
        """,
        nativeQuery = true,
    )
    fun findLivePracticesForClosedLessons(): List<VocabularyPracticeEntity>

    fun deleteByCreatedBySubject(subject: String): Long
}

interface VocabularyPracticeSessionRepo : JpaRepository<VocabularyPracticeSessionEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from VocabularyPracticeSessionEntity session where session.id = :sessionId")
    fun lockById(sessionId: UUID): VocabularyPracticeSessionEntity?

    fun findAllByPracticeIdOrderByCreatedAtAsc(practiceId: UUID): List<VocabularyPracticeSessionEntity>
    fun findByPracticeIdAndOwnerSubject(practiceId: UUID, ownerSubject: String): VocabularyPracticeSessionEntity?
    fun findFirstByOwnerSubjectAndStatusInOrderByUpdatedAtDesc(
        ownerSubject: String,
        statuses: Collection<SessionStatus>,
    ): VocabularyPracticeSessionEntity?
    fun findAllByOwnerSubjectOrderByUpdatedAtDesc(ownerSubject: String): List<VocabularyPracticeSessionEntity>
    fun deleteByOwnerSubject(ownerSubject: String): Long
}

interface VocabularyPracticeItemRepo : JpaRepository<VocabularyPracticeItemEntity, UUID> {
    fun findAllBySessionIdOrderByPositionAsc(sessionId: UUID): List<VocabularyPracticeItemEntity>
    fun findByIdAndSessionId(id: UUID, sessionId: UUID): VocabularyPracticeItemEntity?
}

interface VocabularyPracticeAttemptRepo : JpaRepository<VocabularyPracticeAttemptEntity, UUID> {
    fun findByOwnerSubjectAndClientAttemptId(ownerSubject: String, clientAttemptId: String): VocabularyPracticeAttemptEntity?
    fun findAllBySessionIdOrderByCreatedAtAsc(sessionId: UUID): List<VocabularyPracticeAttemptEntity>
    fun deleteByOwnerSubject(ownerSubject: String): Long
}

interface VocabularyIntegrationOutboxRepo : JpaRepository<VocabularyIntegrationOutboxEntity, UUID> {
    fun findBySessionIdAndSessionRevision(sessionId: UUID, sessionRevision: Long): VocabularyIntegrationOutboxEntity?
    fun findTop50ByStatusAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
        status: String,
        nextAttemptAt: Instant,
    ): List<VocabularyIntegrationOutboxEntity>
}
