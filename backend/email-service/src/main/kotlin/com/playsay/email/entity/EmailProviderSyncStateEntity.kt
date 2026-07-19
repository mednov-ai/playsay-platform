package com.playsay.email.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "email_provider_sync_state")
class EmailProviderSyncStateEntity(
    @Id
    @Column(name = "provider", nullable = false, length = 32)
    var provider: String = "UNISENDER_API",
    @Column(name = "watermark", nullable = false)
    var watermark: Instant = Instant.EPOCH,
    @Column(name = "active_dump_id", length = 160)
    var activeDumpId: String? = null,
    @Column(name = "window_start")
    var windowStart: Instant? = null,
    @Column(name = "window_end")
    var windowEnd: Instant? = null,
    @Column(name = "dump_created_at")
    var dumpCreatedAt: Instant? = null,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
