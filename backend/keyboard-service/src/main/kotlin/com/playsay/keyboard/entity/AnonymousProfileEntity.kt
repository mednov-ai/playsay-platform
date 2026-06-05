package com.playsay.keyboard.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "keyboard_anonymous_profiles")
class AnonymousProfileEntity(
    @Column(name = "device_id", nullable = false, length = 128)
    var deviceId: String,

    @Column(name = "fingerprint_hash", nullable = false, length = 128)
    var fingerprintHash: String,

    @Column(name = "display_name", length = 64)
    var displayName: String? = null,

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "last_seen_at", nullable = false)
    var lastSeenAt: Instant = Instant.now(),
)
