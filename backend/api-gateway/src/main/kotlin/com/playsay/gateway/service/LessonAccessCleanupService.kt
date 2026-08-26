package com.playsay.gateway.service

import com.playsay.gateway.repo.LessonAccessAuditRepo
import com.playsay.gateway.repo.LessonAccessLinkRepo
import com.playsay.gateway.repo.LessonEmailChallengeRepo
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.LessonChallengeRateLimitRepo
import java.time.Clock
import java.time.Duration
import java.time.Instant
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LessonAccessCleanupService(
    private val linkRepo: LessonAccessLinkRepo,
    private val attemptRepo: LessonEntryAttemptRepo,
    private val challengeRepo: LessonEmailChallengeRepo,
    private val auditRepo: LessonAccessAuditRepo,
    private val rateLimitRepo: LessonChallengeRateLimitRepo,
    private val clock: Clock,
) {
    @Scheduled(fixedDelayString = "\${playsay.lesson-access.cleanup-delay-ms:3600000}")
    @Transactional
    fun cleanup() {
        val now = Instant.now(clock)
        challengeRepo.deleteExpiredOrConsumedBefore(now.minus(Duration.ofHours(1)))
        attemptRepo.deleteExpired(now.minus(Duration.ofHours(1)))
        linkRepo.deleteRevokedBefore(now.minus(Duration.ofDays(30)))
        auditRepo.deleteBefore(now.minus(Duration.ofDays(90)))
        rateLimitRepo.deleteExpired(now)
    }
}
