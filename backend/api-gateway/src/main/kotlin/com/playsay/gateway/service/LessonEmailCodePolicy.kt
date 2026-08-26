package com.playsay.gateway.service

import java.time.Duration
import java.time.Instant

object LessonEmailCodePolicy {
    const val MAX_ATTEMPTS = 5
    val TTL: Duration = Duration.ofMinutes(10)
    val RESEND_DELAY: Duration = Duration.ofMinutes(1)

    fun canResend(createdAt: Instant?, now: Instant): Boolean =
        createdAt == null || !createdAt.plus(RESEND_DELAY).isAfter(now)

    fun canVerify(consumedAt: Instant?, expiresAt: Instant, attemptCount: Int, now: Instant): Boolean =
        consumedAt == null && now.isBefore(expiresAt) && attemptCount in 0 until MAX_ATTEMPTS

    fun validFormat(code: String): Boolean = code.trim().length in 6..12
}
