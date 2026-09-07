package com.playsay.media.service

import org.springframework.http.HttpStatus

/** The gateway authorizes missing fields using material metadata; extraction must not contradict it. */
object YoutubeVideoPolicy {
    fun requireNoKnownViolation(durationSeconds: Int?, language: String?) {
        val reason = when {
            durationSeconds != null && durationSeconds <= 0 -> "YOUTUBE_METADATA_MISSING"
            durationSeconds != null && durationSeconds > 420 -> "YOUTUBE_DURATION_TOO_LONG"
            !language.isNullOrBlank() && !Regex("^en(?:[-_].*)?$", RegexOption.IGNORE_CASE).matches(language.trim()) -> "YOUTUBE_LANGUAGE_NOT_ENGLISH"
            else -> null
        }
        if (reason != null) throw MediaServiceException(HttpStatus.UNPROCESSABLE_ENTITY, reason)
    }
}
