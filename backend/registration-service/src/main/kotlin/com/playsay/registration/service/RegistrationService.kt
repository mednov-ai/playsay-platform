package com.playsay.registration.service

import com.playsay.registration.entity.PendingRegistrationEntity
import com.playsay.registration.repo.PendingRegistrationRepo
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class RegistrationService(
    private val repo: PendingRegistrationRepo,
    private val keycloak: KeycloakRegistrationClient,
    private val emailClient: RegistrationEmailClient,
    private val tokenService: RegistrationTokenService,
    private val rateLimiter: InMemoryRegistrationRateLimiter,
    private val clock: Clock,
    @param:Value("\${playsay.registration.public-base-url}") private val publicBaseUrl: String,
    @param:Value("\${playsay.registration.token-ttl-hours}") private val tokenTtlHours: Long,
    @param:Value("\${playsay.registration.resend-cooldown-seconds}") private val resendCooldownSeconds: Long,
) {
    @Transactional
    fun start(command: StartRegistrationCommand): RegistrationResult {
        val email = command.email.normalizedEmail()
        rateLimiter.check(email, command.remoteAddress)

        val existing = repo.findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, registrationStatusPending)
        val now = Instant.now(clock)
        if (existing != null && existing.emailSentAt?.plusSeconds(resendCooldownSeconds)?.isAfter(now) == true) {
            return RegistrationResult(status = registrationStatusCheckEmail)
        }

        val token = tokenService.newToken()
        val pending = PendingRegistrationEntity(
            id = UUID.randomUUID(),
            emailNormalized = email,
            emailOriginal = command.email.trim(),
            displayName = clean(command.displayName, 120),
            locale = command.locale.normalizedLocale(),
            returnTo = clean(command.returnTo, 1024),
            tokenHash = tokenService.hash(token),
            status = registrationStatusPending,
            keycloakCreated = true,
            requestedAt = now,
            emailSentAt = now,
            expiresAt = now.plusSeconds(tokenTtlHours * 3600),
            createdAt = now,
            updatedAt = now,
        )

        val created = keycloak.createDisabledUser(
            KeycloakUserCreateCommand(
                email = email,
                password = command.password,
                displayName = pending.displayName,
                enabled = false,
                emailVerified = false,
            ),
        )
        if (!created) {
            return RegistrationResult(status = registrationStatusCheckEmail)
        }
        repo.saveAndFlush(pending)
        emailClient.sendRegistrationConfirmation(pending.toEmailCommand(token))
        return RegistrationResult(status = registrationStatusCheckEmail)
    }

    @Transactional
    fun resend(command: ResendRegistrationCommand): RegistrationResult {
        val email = command.email.normalizedEmail()
        rateLimiter.check(email, command.remoteAddress)
        val now = Instant.now(clock)
        val existing = repo.findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, registrationStatusPending)
            ?: return RegistrationResult(status = registrationStatusCheckEmail)

        if (existing.emailSentAt?.plusSeconds(resendCooldownSeconds)?.isAfter(now) == true) {
            return RegistrationResult(status = registrationStatusCheckEmail)
        }

        val token = tokenService.newToken()
        existing.tokenHash = tokenService.hash(token)
        existing.locale = command.locale.normalizedLocale()
        existing.returnTo = clean(command.returnTo, 1024) ?: existing.returnTo
        existing.emailSentAt = now
        existing.expiresAt = now.plusSeconds(tokenTtlHours * 3600)
        existing.updatedAt = now
        repo.saveAndFlush(existing)
        emailClient.sendRegistrationConfirmation(existing.toEmailCommand(token))
        return RegistrationResult(status = registrationStatusCheckEmail)
    }

    @Transactional
    fun confirm(token: String): RegistrationResult {
        val pending = repo.findByTokenHashAndStatus(tokenService.hash(token.trim()), registrationStatusPending)
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid registration token.")
        val now = Instant.now(clock)
        if (pending.expiresAt.isBefore(now)) {
            pending.status = registrationStatusExpired
            pending.updatedAt = now
            repo.saveAndFlush(pending)
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Registration token expired.")
        }

        keycloak.enableVerifiedUser(pending.emailNormalized)
        keycloak.assignRealmRole(pending.emailNormalized, studentRole)
        pending.status = registrationStatusConfirmed
        pending.confirmedAt = now
        pending.updatedAt = now
        repo.saveAndFlush(pending)
        return RegistrationResult(status = registrationStatusConfirmed, continueUrl = pending.returnTo)
    }

    private fun PendingRegistrationEntity.toEmailCommand(token: String): RegistrationEmailCommand =
        RegistrationEmailCommand(
            to = emailNormalized,
            displayName = displayName,
            locale = locale,
            confirmationUrl = "${publicBaseUrl.trimEnd('/')}/register/confirm?token=$token",
            idempotencyKey = "registration:$id:$tokenHash",
        )

    private fun String.normalizedEmail(): String =
        trim().lowercase().takeIf { it.isNotBlank() }
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is required.")

    private fun String?.normalizedLocale(): String =
        when (this?.trim()?.lowercase()?.substringBefore("-")) {
            "en" -> "en"
            "de" -> "de"
            "fr" -> "fr"
            else -> "ru"
        }

    private fun clean(value: String?, maxLength: Int): String? {
        val cleaned = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (cleaned.length > maxLength) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Field is too long.")
        }
        return cleaned
    }

    private companion object {
        const val registrationStatusPending = "PENDING"
        const val registrationStatusConfirmed = "CONFIRMED"
        const val registrationStatusExpired = "EXPIRED"
        const val registrationStatusCheckEmail = "CHECK_EMAIL"
        const val studentRole = "STUDENT"
    }
}
