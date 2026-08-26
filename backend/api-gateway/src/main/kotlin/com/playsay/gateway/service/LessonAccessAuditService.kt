package com.playsay.gateway.service

import com.playsay.gateway.entity.LessonAccessAuditEntity
import com.playsay.gateway.repo.LessonAccessAuditRepo
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service

@Service
class LessonAccessAuditService(
    private val repo: LessonAccessAuditRepo,
    private val clock: Clock,
) {
    fun record(lessonId: UUID?, event: LessonAccessAuditEvent, outcome: LessonAccessAuditOutcome, actor: LessonAccessActorKind) {
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
}

enum class LessonAccessAuditEvent {
    LINK_CREATED, LINK_ROTATED, LINK_REVOKED, LINK_STARTED,
    CHALLENGE_REQUESTED, CHALLENGE_VERIFIED,
    LOBBY_REQUESTED, LOBBY_APPROVED, LOBBY_DENIED,
    STUDENT_KICKED, STUDENT_READMITTED, ASSERTION_ISSUED,
    SESSION_REVOKED,
}

enum class LessonAccessAuditOutcome { ACCEPTED, REJECTED, PARTIAL }
enum class LessonAccessActorKind { ANONYMOUS, STUDENT, TEACHER, ADMIN, SYSTEM }
