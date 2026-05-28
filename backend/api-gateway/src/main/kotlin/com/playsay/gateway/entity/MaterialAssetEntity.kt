package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "material_asset")
class MaterialAssetEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "material_id", nullable = false)
    var materialId: UUID = UUID.randomUUID(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "material_id", nullable = false, insertable = false, updatable = false)
    var material: LessonMaterialEntity? = null,
    @Column(name = "kind", nullable = false, length = 48)
    var kind: String = "",
    @Column(name = "storage_key", length = 1024)
    var storageKey: String? = null,
    @Column(name = "external_url", columnDefinition = "TEXT")
    var externalUrl: String? = null,
    @Column(name = "provider", nullable = false, length = 48)
    var provider: String = "",
    @Column(name = "metadata", nullable = false, columnDefinition = "TEXT")
    var metadata: String = "{}",
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
)
