package com.playsay.vocabulary.repo

import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyOccurrenceEntity
import com.playsay.vocabulary.entity.VocabularyLessonAccessProjection
import com.playsay.vocabulary.entity.VocabularyPracticeAttemptEntity
import com.playsay.vocabulary.entity.VocabularyPracticeEntity
import com.playsay.vocabulary.entity.VocabularyPracticeItemEntity
import com.playsay.vocabulary.entity.VocabularyPracticePlanEntity
import com.playsay.vocabulary.entity.VocabularyPracticeSessionEntity
import com.playsay.vocabulary.entity.VocabularyKeySnapshotEntity
import com.playsay.vocabulary.entity.VocabularyKeyTargetEntity
import com.playsay.vocabulary.entity.VocabularyKeyResultEntity
import com.playsay.vocabulary.entity.VocabularySkillStateEntity
import com.playsay.vocabulary.entity.VocabularyIntegrationOutboxEntity
import com.playsay.vocabulary.entity.VocabularyUserProjection
import com.playsay.vocabulary.entity.VocabularyLessonParticipantProjection
import com.playsay.vocabulary.entity.VocabularyLexicalContentRevisionEntity
import com.playsay.vocabulary.entity.VocabularyLexicalSenseEntity
import com.playsay.vocabulary.dto.LexicalCatalogScope
import com.playsay.vocabulary.entity.VocabularyLearningEvidenceEntity
import com.playsay.vocabulary.entity.VocabularyProjectionQueueEntity
import com.playsay.vocabulary.entity.VocabularySelectionRecipeEntity
import com.playsay.vocabulary.entity.VocabularyMediaAssetEntity
import com.playsay.vocabulary.entity.VocabularyMediaGenerationRequestEntity
import com.playsay.vocabulary.entity.VocabularyMediaReviewEventEntity
import com.playsay.vocabulary.entity.VocabularyMediaReportEntity
import com.playsay.vocabulary.entity.VocabularyMediaSnapshotReferenceEntity
import com.playsay.vocabulary.dto.VocabularyMediaAssetState
import com.playsay.vocabulary.dto.VocabularyMediaGenerationState
import com.playsay.vocabulary.dto.PracticeStatus
import com.playsay.vocabulary.dto.SessionStatus
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.domain.Pageable
import jakarta.persistence.LockModeType
import java.util.UUID
import java.time.Instant

interface VocabularyEntryRepo : JpaRepository<VocabularyEntryEntity, UUID> {
    fun deleteByOwnerSubject(ownerSubject: String): Long
    fun findAllByOwnerSubjectAndNormalizedSourceAndSourceLanguageAndTargetLanguageOrderByUpdatedAtDesc(ownerSubject: String, normalizedSource: String, sourceLanguage: String, targetLanguage: String): List<VocabularyEntryEntity>
    fun findByOwnerSubjectAndLexicalSenseId(ownerSubject: String, lexicalSenseId: UUID): VocabularyEntryEntity?
    fun findAllByLexicalSenseIdIsNullOrderByIdAsc(): List<VocabularyEntryEntity>
    fun findAllByLexicalSenseIdOrderByIdAsc(lexicalSenseId: UUID): List<VocabularyEntryEntity>
    fun findAllByOwnerSubjectAndStatusOrderByUpdatedAtDesc(ownerSubject: String, status: EntryStatus): List<VocabularyEntryEntity>
    fun findByIdAndOwnerSubject(id: UUID, ownerSubject: String): VocabularyEntryEntity?
    fun findAllByOwnerSubjectInAndStatus(ownerSubjects: Collection<String>, status: EntryStatus): List<VocabularyEntryEntity>
    fun findAllByOwnerSubjectAndStatusAndFavoriteTrue(ownerSubject: String, status: EntryStatus): List<VocabularyEntryEntity>
    fun findAllByOwnerSubjectAndStatusAndUpdatedAtGreaterThanEqual(ownerSubject: String, status: EntryStatus, updatedAt: Instant): List<VocabularyEntryEntity>
    fun findAllByOwnerSubjectAndIdIn(ownerSubject: String, ids: Collection<UUID>): List<VocabularyEntryEntity>
}

interface VocabularyLexicalSenseRepo : JpaRepository<VocabularyLexicalSenseEntity, UUID> {
    fun findAllByCatalogScopeOrderByIdAsc(catalogScope: LexicalCatalogScope): List<VocabularyLexicalSenseEntity>
    fun findByCatalogScopeAndScopeKeyAndSourceLanguageAndTargetLanguageAndNormalizedLemmaAndNormalizedPartOfSpeechAndNormalizedMeaning(
        catalogScope: LexicalCatalogScope,
        scopeKey: String,
        sourceLanguage: String,
        targetLanguage: String,
        normalizedLemma: String,
        normalizedPartOfSpeech: String,
        normalizedMeaning: String,
    ): VocabularyLexicalSenseEntity?
}

interface VocabularyLexicalContentRevisionRepo : JpaRepository<VocabularyLexicalContentRevisionEntity, UUID> {
    fun findTopBySenseIdOrderByRevisionDesc(senseId: UUID): VocabularyLexicalContentRevisionEntity?
    fun findAllBySenseIdOrderByRevisionAsc(senseId: UUID): List<VocabularyLexicalContentRevisionEntity>
}

interface VocabularyLearningEvidenceRepo : JpaRepository<VocabularyLearningEvidenceEntity, UUID> {
    fun findByOwnerSubjectAndClientEvidenceId(ownerSubject: String, clientEvidenceId: String): VocabularyLearningEvidenceEntity?
    fun findAllBySessionIdOrderByOccurredAtAsc(sessionId: UUID): List<VocabularyLearningEvidenceEntity>
    fun deleteByOwnerSubject(ownerSubject: String): Long
}

interface VocabularyProjectionQueueRepo : JpaRepository<VocabularyProjectionQueueEntity, UUID> {
    fun findByEvidenceId(evidenceId: UUID): VocabularyProjectionQueueEntity?
    fun findTop50ByStatusAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(status: String, nextAttemptAt: Instant): List<VocabularyProjectionQueueEntity>
    fun countByStatus(status: String): Long
    fun countByStatusAndNextAttemptAtBefore(status: String, nextAttemptAt: Instant): Long
    fun findFirstByStatusOrderByCreatedAtAsc(status: String): VocabularyProjectionQueueEntity?
}

interface VocabularySelectionRecipeRepo : JpaRepository<VocabularySelectionRecipeEntity, UUID> {
    fun findAllByOwnerSubjectOrderByUpdatedAtDesc(ownerSubject: String): List<VocabularySelectionRecipeEntity>
    fun findByIdAndOwnerSubject(id: UUID, ownerSubject: String): VocabularySelectionRecipeEntity?
    fun existsByOwnerSubjectAndNameIgnoreCaseAndIdNot(ownerSubject: String, name: String, id: UUID): Boolean
    fun deleteByOwnerSubject(ownerSubject: String): Long
}

interface VocabularyMediaAssetRepo : JpaRepository<VocabularyMediaAssetEntity, UUID> {
    fun findAllBySenseIdOrderByCreatedAtDesc(senseId: UUID): List<VocabularyMediaAssetEntity>
    fun findFirstBySenseIdAndStateOrderByApprovedAtDesc(senseId: UUID, state: VocabularyMediaAssetState): VocabularyMediaAssetEntity?
    fun findAllByStateOrderByCreatedAtAsc(state: VocabularyMediaAssetState): List<VocabularyMediaAssetEntity>
    fun findAllByStateOrderByCreatedAtAsc(state: VocabularyMediaAssetState, pageable: Pageable): List<VocabularyMediaAssetEntity>
    fun findTop50ByStateInAndStorageKeyIsNotNullOrderByUpdatedAtAsc(states: Collection<VocabularyMediaAssetState>): List<VocabularyMediaAssetEntity>
}

interface VocabularyMediaGenerationRequestRepo : JpaRepository<VocabularyMediaGenerationRequestEntity, UUID> {
    fun findByActiveFirstUseKey(activeFirstUseKey: String): VocabularyMediaGenerationRequestEntity?
    fun findTop50ByStateAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(state: VocabularyMediaGenerationState, nextAttemptAt: Instant): List<VocabularyMediaGenerationRequestEntity>
    fun findFirstBySenseIdOrderByCreatedAtDesc(senseId: UUID): VocabularyMediaGenerationRequestEntity?
    fun findAllBySenseIdOrderByCreatedAtAsc(senseId: UUID): List<VocabularyMediaGenerationRequestEntity>
    fun countByState(state: VocabularyMediaGenerationState): Long
    fun countByStateAndNextAttemptAtBefore(state: VocabularyMediaGenerationState, nextAttemptAt: Instant): Long
    fun findFirstByStateOrderByCreatedAtAsc(state: VocabularyMediaGenerationState): VocabularyMediaGenerationRequestEntity?
    fun findTop50ByStateAndUpdatedAtBeforeOrderByUpdatedAtAsc(state: VocabularyMediaGenerationState, updatedAt: Instant): List<VocabularyMediaGenerationRequestEntity>
}

interface VocabularyMediaReviewEventRepo : JpaRepository<VocabularyMediaReviewEventEntity, UUID> {
    fun findAllByAssetIdOrderByCreatedAtAsc(assetId: UUID): List<VocabularyMediaReviewEventEntity>
}

interface VocabularyMediaReportRepo : JpaRepository<VocabularyMediaReportEntity, UUID> {
    fun findByEntryIdAndAssetIdAndReporterSubject(entryId: UUID, assetId: UUID, reporterSubject: String): VocabularyMediaReportEntity?
}

interface VocabularyMediaSnapshotReferenceRepo : JpaRepository<VocabularyMediaSnapshotReferenceEntity, UUID> {
    fun existsByAssetId(assetId: UUID): Boolean
    fun findByPracticeItemId(practiceItemId: UUID): VocabularyMediaSnapshotReferenceEntity?
}

interface VocabularyOccurrenceRepo : JpaRepository<VocabularyOccurrenceEntity, Long> {
    @Query(
        "select distinct occurrence.entry.id from VocabularyOccurrenceEntity occurrence " +
            "where occurrence.entry.id in :entryIds and occurrence.lessonId = :lessonId",
    )
    fun findEntryIdsByLessonId(entryIds: Collection<UUID>, lessonId: UUID): List<UUID>

    @Query("select distinct occurrence.entry.id from VocabularyOccurrenceEntity occurrence where occurrence.entry.ownerSubject = :ownerSubject and occurrence.lessonId = :lessonId")
    fun findEntryIdsByOwnerSubjectAndLessonId(ownerSubject: String, lessonId: UUID): List<UUID>

    @Query("select distinct occurrence.entry.id from VocabularyOccurrenceEntity occurrence where occurrence.entry.ownerSubject = :ownerSubject and occurrence.courseId = :courseId")
    fun findEntryIdsByOwnerSubjectAndCourseId(ownerSubject: String, courseId: UUID): List<UUID>

    @Query("select distinct occurrence.entry.id from VocabularyOccurrenceEntity occurrence where occurrence.entry.ownerSubject = :ownerSubject and occurrence.createdAt >= :since")
    fun findEntryIdsByOwnerSubjectAndCreatedAtAfter(ownerSubject: String, since: Instant): List<UUID>
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
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select state from VocabularySkillStateEntity state where state.entryId = :entryId and state.skill = :skill")
    fun lockByEntryIdAndSkill(entryId: UUID, skill: com.playsay.vocabulary.dto.VocabularySkill): VocabularySkillStateEntity?
    fun deleteByEntryOwnerSubject(ownerSubject: String): Long
    @Query("select distinct state.entryId from VocabularySkillStateEntity state where state.ownerSubject = :ownerSubject and state.skillAvailable = true and state.dueAt <= :now")
    fun findDueEntryIds(ownerSubject: String, now: Instant): List<UUID>
    @Query("select distinct state.entryId from VocabularySkillStateEntity state where state.ownerSubject = :ownerSubject and state.reviewReason = :reason")
    fun findEntryIdsByReviewReason(ownerSubject: String, reason: String): List<UUID>
    @Query("select distinct state.entryId from VocabularySkillStateEntity state where state.ownerSubject = :ownerSubject and state.difficultyScore >= :threshold")
    fun findDifficultEntryIds(ownerSubject: String, threshold: java.math.BigDecimal): List<UUID>
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

    @Modifying
    @Query(
        value = """
            update vocabulary_practices
               set settings_json = '{}'
             where settings_json like concat('%', :subject, '%')
        """,
        nativeQuery = true,
    )
    fun clearSettingsContainingSubject(subject: String): Int

    fun deleteByCreatedBySubject(subject: String): Long
}

interface VocabularyKeySnapshotRepo : JpaRepository<VocabularyKeySnapshotEntity, UUID> {
    fun findBySessionId(sessionId: UUID): VocabularyKeySnapshotEntity?
}

interface VocabularyKeyTargetRepo : JpaRepository<VocabularyKeyTargetEntity, UUID> {
    fun findAllBySnapshotIdOrderByPositionAsc(snapshotId: UUID): List<VocabularyKeyTargetEntity>
}

interface VocabularyKeyResultRepo : JpaRepository<VocabularyKeyResultEntity, UUID> {
    fun existsByTargetId(targetId: UUID): Boolean
    fun findAllBySessionIdOrderByPositionAsc(sessionId: UUID): List<VocabularyKeyResultEntity>
}

interface VocabularyPracticePlanRepo : JpaRepository<VocabularyPracticePlanEntity, UUID> {
    fun findByIdAndCreatedBySubject(id: UUID, createdBySubject: String): VocabularyPracticePlanEntity?
    fun findByCreatedBySubjectAndMaterializationKey(createdBySubject: String, materializationKey: String): VocabularyPracticePlanEntity?
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        "select plan from VocabularyPracticePlanEntity plan where plan.id = :id and plan.createdBySubject = :createdBySubject",
    )
    fun lockByIdAndCreatedBySubject(id: UUID, createdBySubject: String): VocabularyPracticePlanEntity?
    fun deleteByExpiresAtBeforeAndPublishedPracticeIdIsNull(expiresAt: Instant): Long

    @Modifying
    @Query(
        value = """
            delete from vocabulary_practice_plans
             where created_by_subject = :subject
                or payload_json like concat('%"ownerSubject":"', :subject, '"%')
        """,
        nativeQuery = true,
    )
    fun deleteContainingSubject(subject: String): Int
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
    fun findAllByOwnerSubjectOrderByUpdatedAtDesc(ownerSubject: String, pageable: Pageable): List<VocabularyPracticeSessionEntity>
    fun deleteByOwnerSubject(ownerSubject: String): Long
}

interface VocabularyPracticeItemRepo : JpaRepository<VocabularyPracticeItemEntity, UUID> {
    fun findAllBySessionIdOrderByPositionAsc(sessionId: UUID): List<VocabularyPracticeItemEntity>
    fun findByIdAndSessionId(id: UUID, sessionId: UUID): VocabularyPracticeItemEntity?
    fun findAllBySessionIdInOrderBySessionIdAscPositionAsc(sessionIds: Collection<UUID>): List<VocabularyPracticeItemEntity>
}

interface VocabularyPracticeAttemptRepo : JpaRepository<VocabularyPracticeAttemptEntity, UUID> {
    fun findByOwnerSubjectAndClientAttemptId(ownerSubject: String, clientAttemptId: String): VocabularyPracticeAttemptEntity?
    fun findAllBySessionIdOrderByCreatedAtAsc(sessionId: UUID): List<VocabularyPracticeAttemptEntity>
    @Query(
        """
            select case when count(attempt) > 0 then true else false end
              from VocabularyPracticeAttemptEntity attempt
              join VocabularyPracticeItemEntity item on item.id = attempt.itemId
             where attempt.sessionId = :sessionId
               and item.entryId = :entryId
               and item.skill = :skill
               and attempt.scheduleCreditApplied = true
        """,
    )
    fun hasScheduleCredit(
        sessionId: UUID,
        entryId: UUID,
        skill: com.playsay.vocabulary.dto.VocabularySkill,
    ): Boolean
    fun deleteByOwnerSubject(ownerSubject: String): Long
}

interface VocabularyIntegrationOutboxRepo : JpaRepository<VocabularyIntegrationOutboxEntity, UUID> {
    fun findBySessionIdAndSessionRevision(sessionId: UUID, sessionRevision: Long): VocabularyIntegrationOutboxEntity?
    fun findTop50ByStatusAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
        status: String,
        nextAttemptAt: Instant,
    ): List<VocabularyIntegrationOutboxEntity>
    fun countByStatus(status: String): Long
    fun countByStatusAndNextAttemptAtBefore(status: String, nextAttemptAt: Instant): Long
    fun findFirstByStatusOrderByCreatedAtAsc(status: String): VocabularyIntegrationOutboxEntity?
}
