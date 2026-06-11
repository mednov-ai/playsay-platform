package com.playsay.keyboard.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "keyboard_gamification_events")
class GamificationEventEntity(
    @Column(name = "keycloak_subject", length = 255)
    var keycloakSubject: String? = null,

    @Column(name = "anonymous_profile_id")
    var anonymousProfileId: Long? = null,

    @Column(name = "training_result_id")
    var trainingResultId: Long? = null,

    @Column(name = "event_type", nullable = false, length = 48)
    var eventType: String,

    @Column(name = "payload_json", nullable = false, length = 2000)
    var payloadJson: String = "{}",

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),
)
