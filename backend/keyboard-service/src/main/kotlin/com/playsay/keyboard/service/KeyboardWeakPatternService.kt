package com.playsay.keyboard.service

import com.playsay.keyboard.repo.TrainingResultRepo
import com.playsay.keyboard.dto.KeyboardWeakPatternResponse
import java.util.Locale
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

@Service
class KeyboardWeakPatternService(
    private val results: TrainingResultRepo,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    fun forSubject(subject: String, presentedToken: String?): KeyboardWeakPatternResponse {
        if (serviceToken.isBlank() || presentedToken != serviceToken) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        val recent = results.findByKeycloakSubjectOrderByCreatedAtDesc(subject).take(MAX_SESSIONS)
        val patterns = recent
            .flatMap { result -> (result.perChord + result.perChar).entries }
            .mapNotNull { (raw, errors) ->
                raw.lowercase(Locale.ROOT).takeIf { value ->
                    errors > 0 && value.length in 2..8 && value.matches(VALID_PATTERN)
                }?.let { value -> value to errors.coerceAtMost(MAX_ERRORS_PER_SESSION) }
            }
            .groupingBy(Pair<String, Int>::first)
            .fold(0) { total, value -> total + value.second }
            .entries
            .sortedByDescending(Map.Entry<String, Int>::value)
            .take(MAX_PATTERNS)
            .associate(Map.Entry<String, Int>::toPair)
        return KeyboardWeakPatternResponse(subject, patterns, recent.size)
    }

    private companion object {
        val VALID_PATTERN = Regex("[a-z]+(?:['-][a-z]+)*")
        const val MAX_SESSIONS = 50
        const val MAX_PATTERNS = 100
        const val MAX_ERRORS_PER_SESSION = 999
    }
}
