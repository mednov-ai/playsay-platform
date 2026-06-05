package com.playsay.registration.service

import java.time.Clock
import java.time.Instant
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

@Component
class InMemoryRegistrationRateLimiter(
    private val clock: Clock,
    @param:Value("\${playsay.registration.rate-limit.window-seconds}") private val windowSeconds: Long,
    @param:Value("\${playsay.registration.rate-limit.max-per-email}") private val maxPerEmail: Int,
    @param:Value("\${playsay.registration.rate-limit.max-per-ip}") private val maxPerIp: Int,
) {
    private val emailHits = mutableMapOf<String, MutableList<Instant>>()
    private val ipHits = mutableMapOf<String, MutableList<Instant>>()

    @Synchronized
    fun check(email: String, remoteAddress: String?) {
        val now = Instant.now(clock)
        val cutoff = now.minusSeconds(windowSeconds)
        checkBucket(emailHits.getOrPut(email) { mutableListOf() }, cutoff, now, maxPerEmail)
        remoteAddress?.takeIf { it.isNotBlank() }?.let { ip ->
            checkBucket(ipHits.getOrPut(ip) { mutableListOf() }, cutoff, now, maxPerIp)
        }
    }

    private fun checkBucket(bucket: MutableList<Instant>, cutoff: Instant, now: Instant, maxHits: Int) {
        bucket.removeIf { hit -> hit.isBefore(cutoff) }
        if (bucket.size >= maxHits) {
            throw ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS)
        }
        bucket += now
    }
}
