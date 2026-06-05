package com.playsay.keyboard.entity

import com.playsay.keyboard.mapper.PerFingerErrorMapConverter
import jakarta.persistence.Column
import jakarta.persistence.Convert
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "keyboard_training_results")
class TrainingResultEntity(
    @Column(name = "keycloak_subject", nullable = false, length = 255)
    var keycloakSubject: String,

    @Column(name = "chord_set_id", nullable = false)
    var chordSetId: Long,

    @Column(name = "speed_cpm", nullable = false)
    var speedCpm: Double,

    @Column(nullable = false)
    var accuracy: Double,

    @Column(nullable = false)
    var errors: Int,

    @Column(name = "duration_ms", nullable = false)
    var durationMs: Long,

    @Convert(converter = PerFingerErrorMapConverter::class)
    @Column(name = "per_finger", nullable = false, length = 2048)
    var perFinger: Map<String, Int> = emptyMap(),

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),
)
