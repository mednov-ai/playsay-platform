package com.playsay.gateway.service

import com.playsay.gateway.entity.LessonAccessAuditEntity
import com.playsay.gateway.repo.LessonAccessAuditRepo
import io.micrometer.core.instrument.MeterRegistry
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class LessonAccessAuditService(
    private val repo: LessonAccessAuditRepo,
    private val clock: Clock,
    private val meterRegistry: MeterRegistry,
) {
    fun record(lessonId: UUID?, event: LessonAccessAuditEvent, outcome: LessonAccessAuditOutcome, actor: LessonAccessActorKind) {
        persist(lessonId, event, outcome, actor)
        incrementMetric(event, outcome, actor, 1.0)
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun recordIndependent(event: LessonAccessAuditEvent, outcome: LessonAccessAuditOutcome, actor: LessonAccessActorKind) {
        persist(null, event, outcome, actor)
        incrementMetric(event, outcome, actor, 1.0)
    }

    fun recordAggregate(event: LessonAccessAuditEvent, outcome: LessonAccessAuditOutcome, actor: LessonAccessActorKind, count: Long) {
        if (count <= 0) return
        persist(null, event, outcome, actor)
        incrementMetric(event, outcome, actor, count.toDouble())
    }

    private fun persist(lessonId: UUID?, event: LessonAccessAuditEvent, outcome: LessonAccessAuditOutcome, actor: LessonAccessActorKind) {
        repo.save(
            LessonAccessAuditEntity(
                lessonId = lessonId,
                eventCode = event.name,
                outcome = outcome.name,
                actorKind = actor.name,
                createdAt = Instant.now(clock),
            ),
        )
    }

    private fun incrementMetric(
        event: LessonAccessAuditEvent,
        outcome: LessonAccessAuditOutcome,
        actor: LessonAccessActorKind,
        amount: Double,
    ) {
        meterRegistry.counter(
            "playsay.lesson.access.outcomes",
            "event", event.name.lowercase(),
            "outcome", outcome.name.lowercase(),
            "actor", actor.name.lowercase(),
        ).increment(amount)
    }
}

enum class LessonAccessAuditEvent {
    LINK_CREATED, LINK_ROTATED, LINK_REVOKED, LINK_STARTED,
    CHALLENGE_REQUESTED, CHALLENGE_VERIFIED,
    LOBBY_REQUESTED, LOBBY_APPROVED, LOBBY_DENIED,
    STUDENT_KICKED, STUDENT_READMITTED, ASSERTION_ISSUED,
    SESSION_REVOKED,
    REMEMBERED_SESSION_REJECTED, CONFIRMATION_ABANDONED,
}

enum class LessonAccessAuditOutcome { ACCEPTED, REJECTED, PARTIAL }
enum class LessonAccessActorKind { ANONYMOUS, STUDENT, TEACHER, ADMIN, SYSTEM }
