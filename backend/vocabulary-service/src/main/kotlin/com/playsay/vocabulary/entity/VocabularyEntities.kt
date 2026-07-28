package com.playsay.vocabulary.entity

import com.playsay.vocabulary.dto.EntryStatus
import com.playsay.vocabulary.dto.TranslationState
import com.playsay.vocabulary.dto.VocabularySourceType
import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "vocabulary_entries", uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_owner_word_pair", columnNames = ["owner_subject", "normalized_source", "source_language", "target_language"])])
class VocabularyEntryEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @Column(name = "source_text", nullable = false, length = 240) var sourceText: String = "",
    @Column(name = "normalized_source", nullable = false, length = 240) var normalizedSource: String = "",
    @Column(name = "source_language", nullable = false, length = 16) var sourceLanguage: String = "en",
    @Column(name = "target_language", nullable = false, length = 16) var targetLanguage: String = "ru",
    @Column(length = 500) var translation: String? = null,
    @Column(name = "part_of_speech", length = 80) var partOfSpeech: String? = null,
    @Column(length = 1000) var example: String? = null,
    @Column(name = "example_translation", length = 1000) var exampleTranslation: String? = null,
    @Enumerated(EnumType.STRING) @Column(name = "translation_state", nullable = false, length = 16) var translationState: TranslationState = TranslationState.MISSING,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) var status: EntryStatus = EntryStatus.ACTIVE,
    @Column(name = "created_by_subject", nullable = false, length = 255) var createdBySubject: String = "",
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
    @OneToMany(mappedBy = "entry", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("createdAt DESC") var occurrences: MutableList<VocabularyOccurrenceEntity> = mutableListOf(),
)

@Entity
@Table(name = "vocabulary_occurrences")
class VocabularyOccurrenceEntity(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "entry_id", nullable = false) var entry: VocabularyEntryEntity? = null,
    @Enumerated(EnumType.STRING) @Column(name = "source_type", nullable = false, length = 16) var sourceType: VocabularySourceType = VocabularySourceType.MANUAL,
    @Column(name = "lesson_id") var lessonId: UUID? = null,
    @Column(name = "assignment_id") var assignmentId: UUID? = null,
    @Column(name = "material_id") var materialId: UUID? = null,
    @Column(name = "block_id", length = 120) var blockId: String? = null,
    @Column(length = 1000) var context: String? = null,
    @Column(name = "added_by_subject", nullable = false, length = 255) var addedBySubject: String = "",
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)

@Entity
@Table(name = "app_user")
class VocabularyUserProjection(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "keycloak_subject", nullable = false) var keycloakSubject: String = "",
    @Column(length = 16) var locale: String? = null,
    @Column(length = 255) var roles: String? = null,
)

@Entity
@Table(name = "lesson_participant")
class VocabularyLessonParticipantProjection(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "lesson_id", nullable = false) var lessonId: UUID = UUID.randomUUID(),
    @Column(name = "student_user_id", nullable = false) var studentUserId: UUID = UUID.randomUUID(),
)

@Entity
@Table(name = "lesson")
class VocabularyLessonAccessProjection(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "teacher_user_id") var teacherUserId: UUID? = null,
)
