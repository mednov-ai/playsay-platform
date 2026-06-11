package com.playsay.keyboard.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "keyboard_layout_mastery_profiles")
class LayoutMasteryProfileEntity(
    @Column(name = "keycloak_subject", length = 255)
    var keycloakSubject: String? = null,

    @Column(name = "anonymous_profile_id")
    var anonymousProfileId: Long? = null,

    @Column(nullable = false, length = 8)
    var layout: String,

    @Column(name = "mastery_cpm", nullable = false)
    var masteryCpm: Double = 0.0,

    @Column(name = "baseline_mastery_cpm")
    var baselineMasteryCpm: Double? = null,

    @Column(name = "league_level")
    var leagueLevel: Int? = null,

    @Column(name = "calibration_session_count", nullable = false)
    var calibrationSessionCount: Int = 0,

    @Column(name = "calibration_mastery_total", nullable = false)
    var calibrationMasteryTotal: Double = 0.0,

    @Column(name = "calibration_completed_at")
    var calibrationCompletedAt: Instant? = null,

    @Column(name = "trend_json", nullable = false, length = 2048)
    var trendJson: String = "[]",

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
