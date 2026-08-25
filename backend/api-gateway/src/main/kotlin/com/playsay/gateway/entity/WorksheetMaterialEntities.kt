package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "worksheet_import_material_link")
class WorksheetImportMaterialLinkEntity(
    @Id @Column(name = "import_session_id") var importSessionId: UUID = UUID.randomUUID(),
    @Column(name = "material_id", nullable = false) var materialId: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @Column(name = "import_revision", nullable = false) var importRevision: Long = 0,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "material_source_attachment")
@Suppress("LongParameterList")
class MaterialSourceAttachmentEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "material_id", nullable = false) var materialId: UUID = UUID.randomUUID(),
    @Column(name = "import_session_id", nullable = false) var importSessionId: UUID = UUID.randomUUID(),
    @Column(name = "source_id", nullable = false) var sourceId: UUID = UUID.randomUUID(),
    @Column(name = "page_id") var pageId: UUID? = null,
    @Column(name = "source_page_number") var sourcePageNumber: Int? = null,
    @Column(nullable = false, length = 32) var kind: String = "ORIGINAL_SOURCE",
    @Column(name = "file_name", nullable = false, length = 512) var fileName: String = "",
    @Column(name = "mime_type", nullable = false, length = 80) var mimeType: String = "application/octet-stream",
    @Column(name = "byte_size", nullable = false) var byteSize: Long = 0,
    @Column(name = "checksum_sha256", nullable = false, length = 64) var checksumSha256: String = "",
    @Column(name = "storage_key", nullable = false, length = 1024) var storageKey: String = "",
    @Column(nullable = false, columnDefinition = "TEXT") var metadata: String = "{}",
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
)
