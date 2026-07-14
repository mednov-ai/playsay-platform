package com.playsay.aitutor.repo

import com.playsay.aitutor.entity.ConversationSessionEntity
import com.playsay.aitutor.entity.DialogCreditAccountEntity
import com.playsay.aitutor.entity.DialogCreditLedgerEntity
import com.playsay.aitutor.entity.LearnerLessonEntity
import com.playsay.aitutor.entity.LearnerLessonParticipantEntity
import com.playsay.aitutor.entity.LearnerAppUserEntity
import com.playsay.aitutor.entity.LearnerStudentProfileEntity
import com.playsay.aitutor.entity.LearnerVocabularyEntryEntity
import com.playsay.aitutor.entity.SessionEventEntity
import com.playsay.aitutor.entity.StoredDialogCreditSource
import com.playsay.aitutor.entity.StoredSessionStatus
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import java.util.UUID

interface ConversationSessionRepository : JpaRepository<ConversationSessionEntity, UUID> {
    fun findByIdAndSubject(id: UUID, subject: String): ConversationSessionEntity?
    fun findBySubjectAndClientRequestId(subject: String, clientRequestId: UUID): ConversationSessionEntity?
    fun findFirstBySubjectAndStatusOrderByStartedAtDesc(subject: String, status: StoredSessionStatus): ConversationSessionEntity?
    fun existsBySubject(subject: String): Boolean
    fun countBySubjectAndStatus(subject: String, status: StoredSessionStatus): Long
    fun findAllBySubjectAndStatus(subject: String, status: StoredSessionStatus): List<ConversationSessionEntity>
}

interface SessionEventRepository : JpaRepository<SessionEventEntity, Long> {
    fun existsBySessionIdAndClientEventId(sessionId: UUID, clientEventId: String): Boolean
    fun findAllBySessionIdOrderByCreatedAtAsc(sessionId: UUID): List<SessionEventEntity>
}

interface LearnerAppUserRepository : JpaRepository<LearnerAppUserEntity, UUID> {
    fun findByKeycloakSubject(keycloakSubject: String): LearnerAppUserEntity?
    fun findAllByManagedByTeacherUserId(managedByTeacherUserId: UUID): List<LearnerAppUserEntity>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select learner from LearnerAppUserEntity learner where learner.id = :id")
    fun lockById(id: UUID): LearnerAppUserEntity?

    @Query(
        """
        select learner
          from LearnerAppUserEntity learner
         where learner.roles like '%STUDENT%'
         order by coalesce(learner.displayName, learner.username, learner.keycloakSubject)
        """,
    )
    fun findAllStudentsOrdered(): List<LearnerAppUserEntity>
}

interface LearnerStudentProfileRepository : JpaRepository<LearnerStudentProfileEntity, UUID> {
    fun findByUserId(userId: UUID): LearnerStudentProfileEntity?
}

interface LearnerVocabularyEntryRepository : JpaRepository<LearnerVocabularyEntryEntity, UUID> {
    fun findTop5ByOwnerSubjectAndStatusOrderByUpdatedAtDesc(ownerSubject: String, status: String = "ACTIVE"): List<LearnerVocabularyEntryEntity>
}

interface LearnerLessonRepository : JpaRepository<LearnerLessonEntity, UUID>

interface LearnerLessonParticipantRepository : JpaRepository<LearnerLessonParticipantEntity, UUID> {
    @Query(
        """
        select distinct participant.studentUserId
          from LearnerLessonParticipantEntity participant, LearnerLessonEntity lesson
         where participant.lessonId = lesson.id
           and lesson.teacherUserId = :teacherUserId
        """,
    )
    fun findStudentUserIdsByTeacherUserId(teacherUserId: UUID): List<UUID>
}

interface DialogCreditAccountRepository : JpaRepository<DialogCreditAccountEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select account from DialogCreditAccountEntity account where account.studentUserId = :studentUserId")
    fun lockByStudentUserId(studentUserId: UUID): DialogCreditAccountEntity?
}

interface DialogCreditLedgerRepository : JpaRepository<DialogCreditLedgerEntity, UUID> {
    fun findBySourceAndSourceReference(source: StoredDialogCreditSource, sourceReference: UUID): DialogCreditLedgerEntity?
}
