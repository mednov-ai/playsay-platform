package com.playsay.registration.service

import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException

@Component
class PasswordPolicy {
    fun requireValid(password: String, email: String, displayName: String? = null) {
        val failures = validate(password = password, email = email, displayName = displayName)
        if (failures.isNotEmpty()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, failures.joinToString(","))
        }
    }

    fun validate(password: String, email: String, displayName: String? = null): List<String> {
        val failures = mutableListOf<String>()
        val lowered = password.lowercase()

        if (password.length < minLength) {
            failures += "PASSWORD_TOO_SHORT"
        }
        if (password.length > maxLength) {
            failures += "PASSWORD_TOO_LONG"
        }
        if (weakFragments.any { lowered.contains(it) }) {
            failures += "PASSWORD_TOO_COMMON"
        }
        if (email.substringBefore("@").normalizedFragment()?.let { lowered.contains(it) } == true) {
            failures += "PASSWORD_CONTAINS_EMAIL"
        }
        if (displayName?.normalizedNameFragments()?.any { lowered.contains(it) } == true) {
            failures += "PASSWORD_CONTAINS_NAME"
        }
        if (password.characterClassCount() < minimumCharacterClasses) {
            failures += "PASSWORD_NEEDS_VARIETY"
        }

        return failures
    }

    private fun String.characterClassCount(): Int =
        listOf(
            any { it.isLowerCase() },
            any { it.isUpperCase() },
            any { it.isDigit() },
            any { !it.isLetterOrDigit() },
        ).count { it }

    private fun String.normalizedFragment(): String? =
        filter { it.isLetterOrDigit() }
            .lowercase()
            .takeIf { it.length >= 3 }

    private fun String.normalizedNameFragments(): List<String> =
        split(Regex("[^\\p{L}\\p{N}]+"))
            .mapNotNull { it.normalizedFragment() }

    private companion object {
        const val minLength = 8
        const val maxLength = 128
        const val minimumCharacterClasses = 3
        val weakFragments = setOf("password", "qwerty", "12345678", "letmein", "admin", "playsay", "play-and-say")
    }
}
