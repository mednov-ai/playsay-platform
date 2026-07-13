package com.playsay.gateway.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "youtube_video_cache")
class YoutubeVideoCacheEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),
    @Column(name = "video_id", nullable = false, length = 32)
    var videoId: String = "",
    @Column(name = "quality", nullable = false, length = 16)
    var quality: String = "MEDIUM",
    @Column(name = "status", nullable = false, length = 24)
    var status: String = "PENDING",
    @Column(name = "storage_key", length = 1024)
    var storageKey: String? = null,
    @Column(name = "selected_quality", length = 16)
    var selectedQuality: String? = null,
    @Column(name = "selected_height")
    var selectedHeight: Int? = null,
    @Column(name = "content_type", length = 160)
    var contentType: String? = null,
    @Column(name = "byte_size")
    var byteSize: Long? = null,
    @Column(name = "duration_seconds")
    var durationSeconds: Int? = null,
    @Column(name = "language", length = 32)
    var language: String? = null,
    @Column(name = "thumbnail_url", columnDefinition = "TEXT")
    var thumbnailUrl: String? = null,
    @Column(name = "attempts", nullable = false)
    var attempts: Int = 0,
    @Column(name = "next_attempt_at")
    var nextAttemptAt: Instant? = null,
    @Column(name = "lease_until")
    var leaseUntil: Instant? = null,
    @Column(name = "unreferenced_since")
    var unreferencedSince: Instant? = null,
    @Column(name = "last_error_code", length = 120)
    var lastErrorCode: String? = null,
    @Column(name = "ready_at")
    var readyAt: Instant? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)
