package com.playsay.aitutor.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "ai_tutor_sessions")
class ConversationSessionEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "keycloak_subject", nullable = false, length = 255) var subject: String,
    @Column(name = "persona_id", nullable = false, length = 80) var personaId: String,
    @Column(name = "scenario_id", nullable = false, length = 80) var scenarioId: String,
    @Column(name = "feedback_mode", nullable = false, length = 24) var feedbackMode: String,
    @Column(name = "age_policy", nullable = false, length = 16) var agePolicy: String,
    @Column(name = "free_topic", length = 240) var freeTopic: String? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) var status: StoredSessionStatus = StoredSessionStatus.ACTIVE,
    @Column(name = "started_at", nullable = false) var startedAt: Instant = Instant.now(),
    @Column(name = "completed_at") var completedAt: Instant? = null,
    @Column(name = "duration_seconds", nullable = false) var durationSeconds: Long = 0,
    @Column(name = "summary_json", nullable = false, length = 16_000) var summaryJson: String = "{}",
    @Column(name = "vocabulary_goals_json", nullable = false, length = 8_000) var vocabularyGoalsJson: String = "[]",
)

enum class StoredSessionStatus { ACTIVE, COMPLETED, FAILED }
