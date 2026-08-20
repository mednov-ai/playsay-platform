package com.playsay.integration.delivery

import java.time.Duration

enum class IntegrationDeliveryState {
    PENDING,
    COMPLETED;

    val persistedValue: String = name
}

fun exponentialRetryDelay(
    attempt: Int,
    baseDelay: Duration = Duration.ofSeconds(10),
    maximumDelay: Duration = Duration.ofSeconds(300),
): Duration {
    require(!baseDelay.isNegative && !baseDelay.isZero) { "baseDelay must be positive" }
    require(!maximumDelay.isNegative && !maximumDelay.isZero) { "maximumDelay must be positive" }
    val multiplier = 1L shl attempt.coerceIn(0, 5)
    val delay = baseDelay.multipliedBy(multiplier)
    return if (delay > maximumDelay) maximumDelay else delay
}
