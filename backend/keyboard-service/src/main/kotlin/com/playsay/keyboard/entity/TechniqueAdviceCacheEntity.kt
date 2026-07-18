package com.playsay.keyboard.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "keyboard_technique_advice_cache")
class TechniqueAdviceCacheEntity(
    @Column(name = "fingerprint", nullable = false, length = 512)
    var fingerprint: String,

    @Column(name = "locale", nullable = false, length = 2)
    var locale: String = "ru",

    @Column(name = "training_result_id")
    var trainingResultId: Long? = null,

    @Column(name = "source", nullable = false, length = 16)
    var source: String,

    @Column(name = "primary_advice", nullable = false, length = 320)
    var primaryAdvice: String,

    @Column(name = "drill_suggestion", nullable = false, length = 240)
    var drillSuggestion: String,

    @Column(name = "tone", nullable = false, length = 24)
    var tone: String,

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),
)
