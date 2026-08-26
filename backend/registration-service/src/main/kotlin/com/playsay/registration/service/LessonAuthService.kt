package com.playsay.registration.service

import com.playsay.registration.entity.LessonAuthAssertionEntity
import com.playsay.registration.repo.LessonAuthAssertionRepo
import java.net.URI
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

data class LessonResolvedIdentity(
    val subject: String,
    val email: String,
    val displayName: String?,
    val roles: Set<String>,
)

data class CreateLessonAuthAssertionCommand(
    val subject: String,
    val browserAttemptId: UUID,
    val clientId: String,
    val issuer: String,
    val callback: String,
    val rememberMe: Boolean,
)

data class CreatedLessonAuthAssertion(val handle: String, val expiresAt: Instant)
data class RedeemedLessonAuthAssertion(val subject: String, val rememberMe: Boolean)

@Service
class LessonAuthService(
    private val keycloak: KeycloakRegistrationClient,
    private val repo: LessonAuthAssertionRepo,
    private val tokens: RegistrationTokenService,
    private val clock: Clock,
    @param:Value("\${playsay.registration.lesson-auth.client-id:playsay-web}") private val expectedClientId: String,
    @param:Value("\${playsay.registration.lesson-auth.issuer:https://ops.honey.school/keycloak/realms/playsay}") private val expectedIssuer: String,
    @param:Value("\${playsay.registration.lesson-auth.allowed-callback-origins:https://online.honey.school,https://online.honeyschool.ru,http://localhost:5173}") allowedCallbackOrigins: String,
) {
    private val callbackOrigins = allowedCallbackOrigins.split(',').map(String::trim).filter(String::isNotEmpty).toSet()

    fun resolveVerifiedEmail(email: String): LessonResolvedIdentity? {
        val normalized = email.trim().lowercase()
        val user = keycloak.findUserByEmail(normalized)?.let { keycloak.findUserBySubject(it.subject) ?: it } ?: return null
        if (!user.enabled || !user.emailVerified || user.email?.trim()?.lowercase() != normalized) return null
        return LessonResolvedIdentity(user.subject, normalized, user.displayName, user.roles)
    }

    @Transactional
    fun create(command: CreateLessonAuthAssertionCommand): CreatedLessonAuthAssertion {
        validateBinding(command.clientId, command.issuer, command.callback)
        val user = keycloak.findUserBySubject(command.subject)
            ?.takeIf { it.enabled }
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Lesson identity is unavailable.")
        val now = Instant.now(clock)
        val handle = tokens.newToken()
        val assertion = repo.saveAndFlush(
            LessonAuthAssertionEntity(
                handleHash = tokens.hash(handle),
                subject = user.subject,
                browserAttemptId = command.browserAttemptId,
                clientId = command.clientId,
                issuer = command.issuer.trimEnd('/'),
                callback = command.callback,
                rememberMe = command.rememberMe,
                expiresAt = now.plus(assertionTtl),
                createdAt = now,
            ),
        )
        return CreatedLessonAuthAssertion(handle, assertion.expiresAt)
    }

    @Transactional
    fun redeem(handle: String, clientId: String, issuer: String, callback: String): RedeemedLessonAuthAssertion {
        validateBinding(clientId, issuer, callback)
        val assertion = repo.lockByHandleHash(tokens.hash(handle.trim())) ?: throw invalidAssertion()
        val now = Instant.now(clock)
        if (assertion.redeemedAt != null || !now.isBefore(assertion.expiresAt) ||
            assertion.clientId != clientId || assertion.issuer != issuer.trimEnd('/') || assertion.callback != callback
        ) {
            throw invalidAssertion()
        }
        val user = keycloak.findUserBySubject(assertion.subject)?.takeIf { it.enabled } ?: throw invalidAssertion()
        assertion.redeemedAt = now
        repo.saveAndFlush(assertion)
        return RedeemedLessonAuthAssertion(user.subject, assertion.rememberMe)
    }

    fun revokeSession(subject: String, sessionId: String) = keycloak.revokeSession(subject, sessionId)
    fun revokeAllSessions(subject: String) = keycloak.revokeAllSessions(subject)

    @Scheduled(fixedDelayString = "\${playsay.registration.lesson-auth.cleanup-delay-ms:3600000}")
    @Transactional
    fun cleanup() {
        repo.deleteExpiredOrRedeemedBefore(Instant.now(clock).minus(Duration.ofHours(1)))
    }

    private fun validateBinding(clientId: String, issuer: String, callback: String) {
        val callbackOrigin = runCatching { URI(callback).let { "${it.scheme}://${it.authority}" } }.getOrNull()
        if (clientId != expectedClientId || issuer.trimEnd('/') != expectedIssuer.trimEnd('/') || callbackOrigin !in callbackOrigins) {
            throw invalidAssertion()
        }
    }

    private fun invalidAssertion() = ResponseStatusException(HttpStatus.BAD_REQUEST, "Lesson authentication assertion is invalid.")

    private companion object {
        val assertionTtl: Duration = Duration.ofMinutes(2)
    }
}
