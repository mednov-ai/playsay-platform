package com.playsay.worksheetimport.entity

import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.domain.WorksheetPageRole
import com.playsay.worksheetimport.domain.WorksheetSourceKind
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "worksheet_import_session")
@Suppress("LongParameterList")
class WorksheetImportSessionEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) var status: WorksheetImportStatus = WorksheetImportStatus.ANALYZING,
    @Column(nullable = false) var revision: Long = 0,
    @Column(nullable = false, length = 160) var title: String = "",
    @Column(nullable = false, length = 16) var language: String = "",
    @Column(name = "cefr_level", nullable = false, length = 8) var cefrLevel: String = "",
    @Column(name = "source_note", length = 1000) var sourceNote: String? = null,
    @Column(columnDefinition = "TEXT") var analysis: String? = null,
    @Column(columnDefinition = "TEXT") var review: String? = null,
    @Column(name = "failure_class", length = 80) var failureClass: String? = null,
    @Column(name = "retry_count", nullable = false) var retryCount: Int = 0,
    @Column(name = "lease_owner", length = 120) var leaseOwner: String? = null,
    @Column(name = "lease_until") var leaseUntil: Instant? = null,
    @Column(name = "material_id") var materialId: UUID? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.EPOCH,
    @Column(name = "expires_at", nullable = false) var expiresAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "worksheet_import_source")
@Suppress("LongParameterList")
class WorksheetImportSourceEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "session_id", nullable = false) var sessionId: UUID = UUID.randomUUID(),
    @Column(name = "source_order", nullable = false) var sourceOrder: Int = 0,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) var kind: WorksheetSourceKind = WorksheetSourceKind.IMAGE,
    @Column(name = "file_name", nullable = false, length = 512) var fileName: String = "",
    @Column(name = "mime_type", nullable = false, length = 80) var mimeType: String = "",
    @Column(name = "byte_size", nullable = false) var byteSize: Long = 0,
    @Column(name = "checksum_sha256", nullable = false, length = 64) var checksumSha256: String = "",
    @Column(name = "storage_key", nullable = false, length = 1024) var storageKey: String = "",
    @Column(name = "page_count", nullable = false) var pageCount: Int = 0,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "worksheet_import_page")
@Suppress("LongParameterList")
class WorksheetImportPageEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "session_id", nullable = false) var sessionId: UUID = UUID.randomUUID(),
    @Column(name = "source_id", nullable = false) var sourceId: UUID = UUID.randomUUID(),
    @Column(name = "page_order", nullable = false) var pageOrder: Int = 0,
    @Column(name = "source_page_number") var sourcePageNumber: Int? = null,
    @Column(name = "raster_storage_key", nullable = false, length = 1024) var rasterStorageKey: String = "",
    @Column(name = "raster_mime_type", nullable = false, length = 80) var rasterMimeType: String = "",
    @Column(name = "raster_byte_size", nullable = false) var rasterByteSize: Long = 0,
    @Column(name = "raster_checksum_sha256", nullable = false, length = 64) var rasterChecksumSha256: String = "",
    @Column(nullable = false) var width: Int = 0,
    @Column(nullable = false) var height: Int = 0,
    @Column(columnDefinition = "TEXT") var analysis: String? = null,
    @Enumerated(EnumType.STRING) @Column(name = "page_role", length = 32) var pageRole: WorksheetPageRole? = null,
    @Column(name = "answer_key_page_id") var answerKeyPageId: UUID? = null,
    @Column(name = "analysis_attempts", nullable = false) var analysisAttempts: Int = 0,
    @Column(name = "analysis_failure_class", length = 80) var analysisFailureClass: String? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.EPOCH,
)
