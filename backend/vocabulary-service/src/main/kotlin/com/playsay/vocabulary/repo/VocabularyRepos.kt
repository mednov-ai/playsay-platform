package com.playsay.vocabulary.repo

import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyUserProjection
import com.playsay.vocabulary.entity.VocabularyLessonParticipantProjection
import org.springframework.data.jpa.repository.JpaRepository
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
