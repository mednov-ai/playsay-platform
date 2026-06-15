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
import java.time.LocalDate

@Entity
@Table(name = "keyboard_training_results")
class TrainingResultEntity(
    @Column(name = "client_result_id", length = 128)
    var clientResultId: String? = null,

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

    @Column(name = "average_cpm", nullable = false)
    var averageCpm: Double = speedCpm,

    @Column(nullable = false)
    var cadence: Double = 1.0,

    @Column(name = "mastery_cpm")
    var masteryCpm: Double? = null,

    @Column(name = "mastery_delta", nullable = false)
    var masteryDelta: Double = 0.0,

    @Column(nullable = false)
    var accuracy: Double,

    @Column(nullable = false)
    var errors: Int,

    @Column(name = "character_count", nullable = false)
    var characterCount: Int = 0,

    @Column(name = "correct_count", nullable = false)
    var correctCount: Int = 0,

    @Column(name = "duration_ms", nullable = false)
    var durationMs: Long,

    @Column(name = "window_metrics_json", nullable = false, length = 4000)
    var windowMetricsJson: String = "{}",

    @Column(name = "practice_context_json", nullable = false, length = 2048)
    var practiceContextJson: String = "{}",

    @Column(name = "client_timezone", nullable = false, length = 64)
    var clientTimezone: String = "UTC",

    @Column(name = "local_training_date")
    var localTrainingDate: LocalDate? = null,

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
