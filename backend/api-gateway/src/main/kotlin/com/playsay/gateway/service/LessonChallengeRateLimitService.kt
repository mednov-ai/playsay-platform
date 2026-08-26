package com.playsay.gateway.service

import com.playsay.gateway.entity.LessonChallengeRateLimitEntity
import com.playsay.gateway.repo.LessonChallengeRateLimitRepo
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.springframework.stereotype.Service

@Service
class LessonChallengeRateLimitService(
    private val repo: LessonChallengeRateLimitRepo,
    private val tokenService: LessonAccessTokenService,
    private val clock: Clock,
) {
    fun allow(lessonId: UUID, attemptId: UUID, emailDigest: String, clientAddress: String): Boolean =
        listOf(
            Dimension("lesson", lessonId.toString(), 100),
            Dimension("attempt", attemptId.toString(), 10),
            Dimension("email", emailDigest, 5),
            Dimension("address", clientAddress, 30),
        ).all(::consume)

    private fun consume(dimension: Dimension): Boolean {
        val now = Instant.now(clock)
        val windowStart = now.truncatedTo(ChronoUnit.HOURS)
        val dimensionHash = tokenService.protect("lesson-challenge-rate:${dimension.kind}", dimension.value)
        val current = repo.lockByDimensionHashAndWindowStart(dimensionHash, windowStart)
            ?: LessonChallengeRateLimitEntity(
                dimensionHash = dimensionHash,
                windowStart = windowStart,
                expiresAt = windowStart.plus(WINDOW).plus(RETENTION),
            )
        if (!LessonChallengeRateLimitPolicy.allows(current.requestCount, dimension.maximum)) return false
        current.requestCount += 1
        repo.save(current)
        return true
    }

    private data class Dimension(val kind: String, val value: String, val maximum: Int)

    private companion object {
        val WINDOW: Duration = Duration.ofHours(1)
        val RETENTION: Duration = Duration.ofMinutes(5)
    }
}

object LessonChallengeRateLimitPolicy {
    fun allows(currentCount: Int, maximum: Int): Boolean = currentCount >= 0 && maximum > 0 && currentCount < maximum
}
