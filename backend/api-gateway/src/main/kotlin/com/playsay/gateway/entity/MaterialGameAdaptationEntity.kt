package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "material_game_adaptation")
class MaterialGameAdaptationEntity(
    @Id @Column(name = "id", nullable = false) var id: UUID = UUID.randomUUID(),
    @Column(name = "material_id", nullable = false) var materialId: UUID = UUID.randomUUID(),
    @Column(name = "source_asset_id", nullable = false) var sourceAssetId: UUID = UUID.randomUUID(),
    @Column(name = "adapted_asset_id") var adaptedAssetId: UUID? = null,
    @Column(name = "block_id", nullable = false, length = 120) var blockId: String = "",
    @Column(name = "status", nullable = false, length = 32) var status: String = "PENDING",
    @Column(name = "compatibility", nullable = false, length = 32) var compatibility: String = "UNSUPPORTED",
    @Column(name = "report", columnDefinition = "TEXT") var report: String? = null,
    @Column(name = "model", length = 120) var model: String? = null,
    @Column(name = "prompt_hash", length = 128) var promptHash: String? = null,
    @Column(name = "attempts", nullable = false) var attempts: Int = 0,
    @Column(name = "next_attempt_at") var nextAttemptAt: Instant? = null,
    @Column(name = "lease_until") var leaseUntil: Instant? = null,
    @Column(name = "last_error_code", length = 120) var lastErrorCode: String? = null,
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.EPOCH,
)
