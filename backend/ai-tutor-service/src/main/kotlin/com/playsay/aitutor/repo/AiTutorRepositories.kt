package com.playsay.aitutor.repo

import com.playsay.aitutor.entity.ConversationSessionEntity
import com.playsay.aitutor.entity.LearnerAppUserEntity
import com.playsay.aitutor.entity.LearnerStudentProfileEntity
import com.playsay.aitutor.entity.LearnerVocabularyEntryEntity
import com.playsay.aitutor.entity.SessionEventEntity
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ConversationSessionRepository : JpaRepository<ConversationSessionEntity, UUID> {
    fun findByIdAndSubject(id: UUID, subject: String): ConversationSessionEntity?
    fun countBySubjectAndStatus(subject: String, status: com.playsay.aitutor.entity.StoredSessionStatus): Long
    fun findAllBySubjectAndStatus(subject: String, status: com.playsay.aitutor.entity.StoredSessionStatus): List<ConversationSessionEntity>
}

interface SessionEventRepository : JpaRepository<SessionEventEntity, Long> {
    fun existsBySessionIdAndClientEventId(sessionId: UUID, clientEventId: String): Boolean
    fun findAllBySessionIdOrderByCreatedAtAsc(sessionId: UUID): List<SessionEventEntity>
}

interface LearnerAppUserRepository : JpaRepository<LearnerAppUserEntity, UUID> {
    fun findByKeycloakSubject(keycloakSubject: String): LearnerAppUserEntity?
}

interface LearnerStudentProfileRepository : JpaRepository<LearnerStudentProfileEntity, UUID> {
    fun findByUserId(userId: UUID): LearnerStudentProfileEntity?
}

interface LearnerVocabularyEntryRepository : JpaRepository<LearnerVocabularyEntryEntity, UUID> {
    fun findTop5ByOwnerSubjectAndStatusOrderByUpdatedAtDesc(ownerSubject: String, status: String = "ACTIVE"): List<LearnerVocabularyEntryEntity>
}
