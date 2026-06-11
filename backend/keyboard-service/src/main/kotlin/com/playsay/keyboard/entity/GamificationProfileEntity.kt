package com.playsay.keyboard.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

@Entity
@Table(name = "keyboard_gamification_profiles")
class GamificationProfileEntity(
    @Column(name = "keycloak_subject", length = 255)
    var keycloakSubject: String? = null,

    @Column(name = "anonymous_profile_id")
    var anonymousProfileId: Long? = null,

    @Column(name = "mastery_cpm", nullable = false)
    var masteryCpm: Double = 0.0,

    @Column(name = "baseline_mastery_cpm")
    var baselineMasteryCpm: Double? = null,

    @Column(name = "league_level")
    var leagueLevel: Int? = null,

    @Column(name = "current_streak", nullable = false)
    var currentStreak: Int = 0,

    @Column(name = "best_streak", nullable = false)
    var bestStreak: Int = 0,

    @Column(name = "streak_freezes", nullable = false)
    var streakFreezes: Int = 1,

    @Column(name = "last_training_date")
    var lastTrainingDate: LocalDate? = null,

    @Column(name = "trend_json", nullable = false, length = 2048)
    var trendJson: String = "[]",

    @Column(name = "achievements_json", nullable = false, length = 2048)
    var achievementsJson: String = "[]",

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
