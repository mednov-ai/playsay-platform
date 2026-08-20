package com.playsay.vocabulary.entity

import com.playsay.vocabulary.dto.LexicalCatalogScope
import com.playsay.vocabulary.dto.LexicalContentStatus
import com.playsay.vocabulary.dto.LexicalImageability
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.time.Instant
import java.util.UUID

@Entity
@Table(
    name = "vocabulary_lexical_senses",
    uniqueConstraints = [
        UniqueConstraint(
            name = "uq_vocabulary_lexical_sense_identity",
            columnNames = [
                "catalog_scope",
                "scope_key",
                "source_language",
                "target_language",
                "normalized_lemma",
                "normalized_part_of_speech",
                "normalized_meaning",
            ],
        ),
    ],
)
class VocabularyLexicalSenseEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Enumerated(EnumType.STRING)
    @Column(name = "catalog_scope", nullable = false, length = 24)
    var catalogScope: LexicalCatalogScope = LexicalCatalogScope.LEARNER,
    @Column(name = "scope_key", nullable = false, length = 255) var scopeKey: String = "",
    @Column(name = "source_language", nullable = false, length = 16) var sourceLanguage: String = "en",
    @Column(name = "target_language", nullable = false, length = 16) var targetLanguage: String = "ru",
    @Column(name = "normalized_lemma", nullable = false, length = 240) var normalizedLemma: String = "",
    @Column(name = "normalized_part_of_speech", nullable = false, length = 80) var normalizedPartOfSpeech: String = "",
    @Column(name = "normalized_meaning", nullable = false, length = 500) var normalizedMeaning: String = "",
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    var imageability: LexicalImageability = LexicalImageability.UNKNOWN,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

@Entity
@Table(
    name = "vocabulary_lexical_content_revisions",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_content_sense_revision", columnNames = ["sense_id", "revision"])],
)
class VocabularyLexicalContentRevisionEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "sense_id", nullable = false) var senseId: UUID = UUID.randomUUID(),
    @Column(nullable = false) var revision: Long = 1,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var status: LexicalContentStatus = LexicalContentStatus.ACTIVE,
    @Column(name = "source_text", nullable = false, length = 240) var sourceText: String = "",
    @Column(length = 500) var translation: String? = null,
    @Column(length = 1000) var definition: String? = null,
    @Column(name = "part_of_speech", length = 80) var partOfSpeech: String? = null,
    @Column(length = 1000) var example: String? = null,
    @Column(name = "example_translation", length = 1000) var exampleTranslation: String? = null,
    @Column(name = "accepted_answers_json", nullable = false, columnDefinition = "TEXT") var acceptedAnswersJson: String = "[]",
    @Column(name = "created_by_subject", length = 255) var createdBySubject: String? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)
