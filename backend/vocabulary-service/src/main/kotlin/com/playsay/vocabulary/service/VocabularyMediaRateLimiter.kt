package com.playsay.vocabulary.service

import java.time.Duration
import java.time.Instant
import java.util.ArrayDeque
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

@Component
class VocabularyMediaRateLimiter(
    @param:Value("\${playsay.vocabulary.media.regeneration-limit-per-hour:5}") private val limitPerHour: Int,
) {
    private val attempts = ConcurrentHashMap<String, ArrayDeque<Instant>>()

    fun requireRegenerationAllowed(actorSubject: String, senseId: UUID, now: Instant = Instant.now()) {
        val key = "$actorSubject:$senseId"
        val queue = attempts.computeIfAbsent(key) { ArrayDeque() }
        synchronized(queue) {
            val cutoff = now.minus(WINDOW)
            while (queue.firstOrNull()?.isBefore(cutoff) == true) queue.removeFirst()
            if (queue.size >= limitPerHour.coerceAtLeast(1)) {
                throw ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Regeneration limit reached; try again later")
            }
            queue.addLast(now)
        }
        if (attempts.size > MAX_KEYS) {
            attempts.entries.removeIf { (_, values) -> synchronized(values) { values.lastOrNull()?.isBefore(now.minus(WINDOW)) != false } }
        }
    }

    private companion object {
        val WINDOW: Duration = Duration.ofHours(1)
        const val MAX_KEYS = 10_000
    }
}
