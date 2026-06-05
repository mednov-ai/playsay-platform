package com.playsay.keyboard.entity

import com.playsay.keyboard.mapper.PerFingerErrorMapConverter
import com.playsay.keyboard.mapper.StringListConverter
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
    @Column(name = "keycloak_subject", length = 255)
    var keycloakSubject: String? = null,

    @Column(name = "anonymous_profile_id")
    var anonymousProfileId: Long? = null,

    @Column(name = "chord_set_id", nullable = false)
    var chordSetId: Long,

    @Column(name = "lesson_kind", nullable = false, length = 16)
    var lessonKind: String = "STANDARD",

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

    @Convert(converter = PerFingerErrorMapConverter::class)
    @Column(name = "per_char", nullable = false, length = 2048)
    var perChar: Map<String, Int> = emptyMap(),

    @Convert(converter = PerFingerErrorMapConverter::class)
    @Column(name = "per_chord", nullable = false, length = 2048)
    var perChord: Map<String, Int> = emptyMap(),

    @Convert(converter = StringListConverter::class)
    @Column(name = "focus_problem_keys", nullable = false, length = 1024)
    var focusProblemKeys: List<String> = emptyList(),

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),
)
