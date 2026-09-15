package com.playsay.gateway.service

import com.playsay.gateway.entity.LessonAccessAuditEntity
import com.playsay.gateway.repo.LessonAccessAuditRepo
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify

class LessonAccessAuditServiceTest {
    @Test
    fun `independent and aggregate outcomes persist no lesson context and expose enum-only metrics`() {
        val repo = mock(LessonAccessAuditRepo::class.java)
        val meters = SimpleMeterRegistry()
        val service = LessonAccessAuditService(
            repo,
            Clock.fixed(Instant.parse("2026-09-15T10:00:00Z"), ZoneOffset.UTC),
            meters,
        )

        service.recordIndependent(
            LessonAccessAuditEvent.REMEMBERED_SESSION_REJECTED,
            LessonAccessAuditOutcome.REJECTED,
            LessonAccessActorKind.STUDENT,
        )
        service.recordAggregate(
            LessonAccessAuditEvent.CONFIRMATION_ABANDONED,
            LessonAccessAuditOutcome.PARTIAL,
            LessonAccessActorKind.SYSTEM,
            3,
        )

        val rows = ArgumentCaptor.forClass(LessonAccessAuditEntity::class.java)
        verify(repo, times(2)).save(rows.capture())
        rows.allValues.forEach { assertNull(it.lessonId) }
        assertEquals(
            1.0,
            meters.counter(
                "playsay.lesson.access.outcomes",
                "event", "remembered_session_rejected",
                "outcome", "rejected",
                "actor", "student",
            ).count(),
        )
        assertEquals(
            3.0,
            meters.counter(
                "playsay.lesson.access.outcomes",
                "event", "confirmation_abandoned",
                "outcome", "partial",
                "actor", "system",
            ).count(),
        )
    }
}
