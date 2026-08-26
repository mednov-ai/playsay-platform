package com.playsay.gateway.service

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LessonEmailCodePolicyTest {
    private val now = Instant.parse("2026-08-26T10:00:00Z")

    @Test
    fun `code verification fails closed for replay expiry and exhaustion`() {
        assertTrue(LessonEmailCodePolicy.canVerify(null, now.plusSeconds(1), 4, now))
        assertFalse(LessonEmailCodePolicy.canVerify(now.minusSeconds(1), now.plusSeconds(1), 0, now))
        assertFalse(LessonEmailCodePolicy.canVerify(null, now, 0, now))
        assertFalse(LessonEmailCodePolicy.canVerify(null, now.plusSeconds(1), 5, now))
    }

    @Test
    fun `resend is allowed only after the full delay`() {
        assertTrue(LessonEmailCodePolicy.canResend(null, now))
        assertFalse(LessonEmailCodePolicy.canResend(now.minusSeconds(59), now))
        assertTrue(LessonEmailCodePolicy.canResend(now.minusSeconds(60), now))
    }

    @Test
    fun `format accepts only bounded trimmed codes`() {
        assertTrue(LessonEmailCodePolicy.validFormat(" 123456 "))
        assertFalse(LessonEmailCodePolicy.validFormat("12345"))
        assertFalse(LessonEmailCodePolicy.validFormat("1234567890123"))
    }
}
