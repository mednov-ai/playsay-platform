package com.playsay.gateway.service

import com.playsay.gateway.repo.LessonAccessAuditRepo
import com.playsay.gateway.repo.LessonAccessLinkRepo
import com.playsay.gateway.repo.LessonChallengeRateLimitRepo
import com.playsay.gateway.repo.LessonEmailChallengeRepo
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`

class LessonAccessCleanupServiceTest {
    @Test
    fun `counts expired untouched confirmation attempts without persisting protected context`() {
        val now = Instant.parse("2026-09-15T10:00:00Z")
        val linkRepo = mock(LessonAccessLinkRepo::class.java)
        val attemptRepo = mock(LessonEntryAttemptRepo::class.java)
        val challengeRepo = mock(LessonEmailChallengeRepo::class.java)
        val auditRepo = mock(LessonAccessAuditRepo::class.java)
        val auditService = mock(LessonAccessAuditService::class.java)
        val rateLimitRepo = mock(LessonChallengeRateLimitRepo::class.java)
        val cutoff = now.minusSeconds(3600)
        `when`(attemptRepo.countByStateAndExpiresAtBefore("STARTED", cutoff)).thenReturn(3)
        val service = LessonAccessCleanupService(
            linkRepo,
            attemptRepo,
            challengeRepo,
            auditRepo,
            auditService,
            rateLimitRepo,
            Clock.fixed(now, ZoneOffset.UTC),
        )

        service.cleanup()

        verify(auditService).recordAggregate(
            LessonAccessAuditEvent.CONFIRMATION_ABANDONED,
            LessonAccessAuditOutcome.PARTIAL,
            LessonAccessActorKind.SYSTEM,
            3,
        )
        verify(attemptRepo).deleteExpired(cutoff)
    }
}
