package com.playsay.vocabulary.entity

import com.playsay.vocabulary.dto.LexicalCatalogScope
import com.playsay.vocabulary.dto.VocabularyMediaAssetState
import com.playsay.vocabulary.dto.VocabularyMediaGenerationState
import com.playsay.vocabulary.dto.VocabularyMediaSafetyState
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
@Table(name = "vocabulary_media_assets")
class VocabularyMediaAssetEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "sense_id", nullable = false) var senseId: UUID = UUID.randomUUID(),
    @Enumerated(EnumType.STRING) @Column(name = "catalog_scope", nullable = false, length = 24) var catalogScope: LexicalCatalogScope = LexicalCatalogScope.LEARNER,
    @Column(name = "scope_key", nullable = false, length = 255) var scopeKey: String = "",
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var state: VocabularyMediaAssetState = VocabularyMediaAssetState.GENERATING,
    @Column(nullable = false, length = 24) var origin: String = "GENERATED",
    @Column(name = "storage_key", length = 500) var storageKey: String? = null,
    @Column(name = "content_type", length = 100) var contentType: String? = null,
    @Column(name = "byte_size") var byteSize: Long? = null,
    var width: Int? = null,
    var height: Int? = null,
    @Column(name = "checksum_sha256", length = 64) var checksumSha256: String? = null,
    @Column(name = "generator_type", length = 32) var generatorType: String? = null,
    @Column(name = "generator_model", length = 120) var generatorModel: String? = null,
    @Column(name = "prompt_template_version", length = 64) var promptTemplateVersion: String? = null,
    @Column(name = "prompt_fingerprint", length = 64) var promptFingerprint: String? = null,
    @Enumerated(EnumType.STRING) @Column(name = "safety_state", nullable = false, length = 32) var safetyState: VocabularyMediaSafetyState = VocabularyMediaSafetyState.PENDING,
    @Column(name = "alt_text_json", nullable = false, columnDefinition = "TEXT") var altTextJson: String = "{}",
    @Column(nullable = false) var decorative: Boolean = false,
    @Column(name = "supersedes_asset_id") var supersedesAssetId: UUID? = null,
    @Column(name = "approved_by_subject", length = 255) var approvedBySubject: String? = null,
    @Column(name = "approved_at") var approvedAt: Instant? = null,
    @Column(name = "retired_at") var retiredAt: Instant? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

@Entity
@Table(name = "vocabulary_media_generation_requests")
class VocabularyMediaGenerationRequestEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "sense_id", nullable = false) var senseId: UUID = UUID.randomUUID(),
    @Column(name = "policy_version", nullable = false, length = 64) var policyVersion: String = "vocabulary-media-v1",
    @Column(name = "request_kind", nullable = false, length = 24) var requestKind: String = "FIRST_USE",
    @Column(name = "active_first_use_key", length = 128, unique = true) var activeFirstUseKey: String? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) var state: VocabularyMediaGenerationState = VocabularyMediaGenerationState.PENDING,
    @Column(name = "requested_by_subject", length = 255) var requestedBySubject: String? = null,
    @Column(name = "asset_id") var assetId: UUID? = null,
    @Column(name = "attempt_count", nullable = false) var attemptCount: Int = 0,
    @Column(name = "next_attempt_at", nullable = false) var nextAttemptAt: Instant = Instant.now(),
    @Column(name = "failure_code", length = 64) var failureCode: String? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

@Entity
@Table(name = "vocabulary_media_review_events")
class VocabularyMediaReviewEventEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "asset_id", nullable = false) var assetId: UUID = UUID.randomUUID(),
    @Column(name = "actor_subject", nullable = false, length = 255) var actorSubject: String = "",
    @Column(nullable = false, length = 32) var action: String = "",
    @Column(name = "reason_code", length = 64) var reasonCode: String? = null,
    @Column(length = 500) var note: String? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)

@Entity
@Table(name = "vocabulary_media_reports", uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_media_report_actor", columnNames = ["entry_id", "asset_id", "reporter_subject"])])
class VocabularyMediaReportEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "entry_id", nullable = false) var entryId: UUID = UUID.randomUUID(),
    @Column(name = "asset_id", nullable = false) var assetId: UUID = UUID.randomUUID(),
    @Column(name = "reporter_subject", nullable = false, length = 255) var reporterSubject: String = "",
    @Column(name = "reason_code", nullable = false, length = 64) var reasonCode: String = "WRONG_SENSE",
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)

@Entity
@Table(name = "vocabulary_media_snapshot_refs", uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_media_snapshot_item", columnNames = ["practice_item_id"])])
class VocabularyMediaSnapshotReferenceEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "practice_item_id", nullable = false) var practiceItemId: UUID = UUID.randomUUID(),
    @Column(name = "asset_id", nullable = false) var assetId: UUID = UUID.randomUUID(),
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
)
