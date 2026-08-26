package com.playsay.gateway.service

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LessonChallengeRateLimitPolicyTest {
    @Test
    fun `allows requests only below a positive bound`() {
        assertTrue(LessonChallengeRateLimitPolicy.allows(0, 5))
        assertTrue(LessonChallengeRateLimitPolicy.allows(4, 5))
        assertFalse(LessonChallengeRateLimitPolicy.allows(5, 5))
        assertFalse(LessonChallengeRateLimitPolicy.allows(6, 5))
        assertFalse(LessonChallengeRateLimitPolicy.allows(-1, 5))
        assertFalse(LessonChallengeRateLimitPolicy.allows(0, 0))
    }
}
