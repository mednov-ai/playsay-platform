package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "material_html_game_enrichment")
class MaterialHtmlGameEnrichmentEntity(
    @Id @Column(name = "id", nullable = false) var id: UUID = UUID.randomUUID(),
    @Column(name = "material_id", nullable = false) var materialId: UUID = UUID.randomUUID(),
    @Column(name = "asset_id", nullable = false) var assetId: UUID = UUID.randomUUID(),
    @Column(name = "block_id", nullable = false, length = 120) var blockId: String = "",
    @Column(name = "status", nullable = false, length = 24) var status: String = "PENDING",
    @Column(name = "preferred_title", length = 160) var preferredTitle: String? = null,
    @Column(name = "resolved_title", length = 160) var resolvedTitle: String? = null,
    @Column(name = "title_source", length = 16) var titleSource: String? = null,
    @Column(name = "icon_asset_id") var iconAssetId: UUID? = null,
    @Column(name = "attempts", nullable = false) var attempts: Int = 0,
    @Column(name = "next_attempt_at") var nextAttemptAt: Instant? = null,
    @Column(name = "lease_until") var leaseUntil: Instant? = null,
    @Column(name = "last_error_code", length = 120) var lastErrorCode: String? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.EPOCH,
)
