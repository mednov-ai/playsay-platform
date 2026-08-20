package com.playsay.integration.delivery

import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class IntegrationDeliveryTest {
    @Test
    fun `keeps the existing capped exponential retry schedule`() {
        assertEquals(Duration.ofSeconds(10), exponentialRetryDelay(0))
        assertEquals(Duration.ofSeconds(20), exponentialRetryDelay(1))
        assertEquals(Duration.ofSeconds(40), exponentialRetryDelay(2))
        assertEquals(Duration.ofSeconds(300), exponentialRetryDelay(5))
        assertEquals(Duration.ofSeconds(300), exponentialRetryDelay(100))
    }

    @Test
    fun `supports an explicit bounded schedule`() {
        assertEquals(
            Duration.ofSeconds(12),
            exponentialRetryDelay(2, Duration.ofSeconds(3), Duration.ofSeconds(15)),
        )
        assertEquals(
            Duration.ofSeconds(15),
            exponentialRetryDelay(3, Duration.ofSeconds(3), Duration.ofSeconds(15)),
        )
    }

    @Test
    fun `rejects non-positive delay bounds`() {
        assertFailsWith<IllegalArgumentException> { exponentialRetryDelay(1, Duration.ZERO) }
        assertFailsWith<IllegalArgumentException> {
            exponentialRetryDelay(1, maximumDelay = Duration.ofSeconds(-1))
        }
    }

    @Test
    fun `delivery states keep their persisted values`() {
        assertEquals("PENDING", IntegrationDeliveryState.PENDING.persistedValue)
        assertEquals("COMPLETED", IntegrationDeliveryState.COMPLETED.persistedValue)
    }
}
