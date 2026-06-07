package com.playsay.registration.service

import com.playsay.registration.entity.PasswordResetCodeEntity
import com.playsay.registration.entity.PendingRegistrationEntity
import com.playsay.registration.repo.PasswordResetCodeRepo
import com.playsay.registration.repo.PendingRegistrationRepo
import java.time.Clock
import java.time.Instant
import java.security.SecureRandom
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class RegistrationService(
    private val repo: PendingRegistrationRepo,
    private val passwordResetCodeRepo: PasswordResetCodeRepo,
    private val keycloak: KeycloakRegistrationClient,
    private val emailClient: RegistrationEmailClient,
    private val tokenService: RegistrationTokenService,
    private val passwordPolicy: PasswordPolicy,
    private val rateLimiter: InMemoryRegistrationRateLimiter,
    private val clock: Clock,
    @param:Value("\${playsay.registration.public-base-url}") private val publicBaseUrl: String,
    @param:Value("\${playsay.registration.token-ttl-hours}") private val tokenTtlHours: Long,
    @param:Value("\${playsay.registration.resend-cooldown-seconds}") private val resendCooldownSeconds: Long,
    @param:Value("\${playsay.registration.password-reset-code-ttl-minutes}") private val passwordResetCodeTtlMinutes: Long,
    @param:Value("\${playsay.registration.password-reset-max-attempts}") private val passwordResetMaxAttempts: Int,
) {
    private val resetCodeRandom = SecureRandom()
    private val returnToPolicy = ReturnToUrlPolicy()

    @Transactional
    fun start(command: StartRegistrationCommand): RegistrationResult {
        val email = command.email.normalizedEmail()
        passwordPolicy.requireValid(command.password, email, command.displayName)
        rateLimiter.check(email, command.remoteAddress)

        val existing = repo.findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, registrationStatusPending)
        val now = Instant.now(clock)
        if (existing != null) {
            if (existing.emailSentAt?.plusSeconds(resendCooldownSeconds)?.isAfter(now) == true) {
                return RegistrationResult(status = registrationStatusCheckEmail)
            }
            return refreshPendingRegistrationEmail(
                pending = existing,
                displayName = command.displayName,
                locale = command.locale,
                returnTo = command.returnTo,
                now = now,
            )
        }

        val token = tokenService.newToken()
        val pending = PendingRegistrationEntity(
            id = UUID.randomUUID(),
            emailNormalized = email,
            emailOriginal = command.email.trim(),
            displayName = clean(command.displayName, 120),
            locale = command.locale.normalizedLocale(),
            returnTo = allowedReturnTo(command.returnTo),
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
            val user = keycloak.findUserByEmail(email)
            if (user?.enabled == false) {
                keycloak.updatePassword(email, command.password)
                repo.saveAndFlush(pending)
                emailClient.sendRegistrationConfirmation(pending.toEmailCommand(token))
                return RegistrationResult(status = registrationStatusCheckEmail)
            }
            sendPasswordResetForActiveUser(
                email = email,
                emailOriginal = command.email.trim(),
                displayName = clean(command.displayName, 120),
                locale = command.locale.normalizedLocale(),
                returnTo = allowedReturnTo(command.returnTo),
                now = now,
            )
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

        return refreshPendingRegistrationEmail(
            pending = existing,
            displayName = null,
            locale = command.locale,
            returnTo = command.returnTo,
            now = now,
        )
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
        pending.returnTo = allowedReturnTo(pending.returnTo)
        repo.saveAndFlush(pending)
        return RegistrationResult(status = registrationStatusConfirmed, continueUrl = pending.returnTo)
    }

    @Transactional
    fun forgotPassword(command: ForgotPasswordCommand): RegistrationResult {
        val email = command.email.normalizedEmail()
        rateLimiter.check(email, command.remoteAddress)
        val now = Instant.now(clock)
        sendPasswordResetForActiveUser(
            email = email,
            emailOriginal = command.email.trim(),
            displayName = null,
            locale = command.locale.normalizedLocale(),
            returnTo = allowedReturnTo(command.returnTo),
            now = now,
        )
        return RegistrationResult(status = registrationStatusCheckEmail)
    }

    @Transactional
    fun resetPassword(command: ResetPasswordCommand): RegistrationResult {
        val email = command.email.normalizedEmail()
        rateLimiter.check(email, command.remoteAddress)
        passwordPolicy.requireValid(command.newPassword, email)
        val code = command.code.trim()
        val now = Instant.now(clock)
        if (!passwordResetCodeRegex.matches(code)) {
            rejectInvalidPasswordReset(email, now)
        }

        val resetCode = passwordResetCodeRepo.findByEmailNormalizedAndCodeHashAndStatus(
            emailNormalized = email,
            codeHash = passwordResetCodeHash(email, code),
            status = passwordResetStatusPending,
        ) ?: rejectInvalidPasswordReset(email, now)

        if (resetCode.expiresAt.isBefore(now) || resetCode.attempts >= passwordResetMaxAttempts) {
            resetCode.status = passwordResetStatusExpired
            resetCode.updatedAt = now
            passwordResetCodeRepo.saveAndFlush(resetCode)
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Password reset code expired.")
        }

        keycloak.updatePassword(email, command.newPassword)
        resetCode.status = passwordResetStatusConsumed
        resetCode.consumedAt = now
        resetCode.updatedAt = now
        passwordResetCodeRepo.saveAndFlush(resetCode)
        return RegistrationResult(status = registrationStatusPasswordReset)
    }

    private fun refreshPendingRegistrationEmail(
        pending: PendingRegistrationEntity,
        displayName: String?,
        locale: String?,
        returnTo: String?,
        now: Instant,
    ): RegistrationResult {
        val token = tokenService.newToken()
        pending.tokenHash = tokenService.hash(token)
        pending.displayName = clean(displayName, 120) ?: pending.displayName
        pending.locale = locale.normalizedLocale()
        pending.returnTo = allowedReturnTo(returnTo) ?: pending.returnTo
        pending.emailSentAt = now
        pending.expiresAt = now.plusSeconds(tokenTtlHours * 3600)
        pending.updatedAt = now
        repo.saveAndFlush(pending)
        emailClient.sendRegistrationConfirmation(pending.toEmailCommand(token))
        return RegistrationResult(status = registrationStatusCheckEmail)
    }

    private fun sendPasswordResetForActiveUser(
        email: String,
        emailOriginal: String,
        displayName: String?,
        locale: String,
        returnTo: String?,
        now: Instant,
    ) {
        val user = keycloak.findUserByEmail(email)
        if (user?.enabled != true) {
            return
        }

        val latest = passwordResetCodeRepo
            .findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, passwordResetStatusPending)
        if (latest != null) {
            if (latest.expiresAt.isBefore(now)) {
                latest.status = passwordResetStatusExpired
                latest.updatedAt = now
                passwordResetCodeRepo.saveAndFlush(latest)
            } else if (latest.emailSentAt?.plusSeconds(resendCooldownSeconds)?.isAfter(now) == true) {
                return
            } else {
                refreshPasswordResetCode(latest, displayName, locale, returnTo, now)
                return
            }
        }

        val code = newPasswordResetCode()
        val resetCode = PasswordResetCodeEntity(
            id = UUID.randomUUID(),
            emailNormalized = email,
            emailOriginal = emailOriginal,
            displayName = displayName,
            locale = locale,
            returnTo = returnTo,
            codeHash = passwordResetCodeHash(email, code),
            status = passwordResetStatusPending,
            attempts = 0,
            requestedAt = now,
            emailSentAt = now,
            expiresAt = now.plusSeconds(passwordResetCodeTtlMinutes * 60),
            createdAt = now,
            updatedAt = now,
        )
        passwordResetCodeRepo.saveAndFlush(resetCode)
        emailClient.sendPasswordResetCode(resetCode.toEmailCommand(code))
    }

    private fun refreshPasswordResetCode(
        resetCode: PasswordResetCodeEntity,
        displayName: String?,
        locale: String,
        returnTo: String?,
        now: Instant,
    ) {
        val code = newPasswordResetCode()
        resetCode.displayName = displayName ?: resetCode.displayName
        resetCode.locale = locale
        resetCode.returnTo = returnTo ?: resetCode.returnTo
        resetCode.codeHash = passwordResetCodeHash(resetCode.emailNormalized, code)
        resetCode.attempts = 0
        resetCode.emailSentAt = now
        resetCode.expiresAt = now.plusSeconds(passwordResetCodeTtlMinutes * 60)
        resetCode.updatedAt = now
        passwordResetCodeRepo.saveAndFlush(resetCode)
        emailClient.sendPasswordResetCode(resetCode.toEmailCommand(code))
    }

    private fun rejectInvalidPasswordReset(email: String, now: Instant): Nothing {
        val latest = passwordResetCodeRepo
            .findFirstByEmailNormalizedAndStatusOrderByCreatedAtDesc(email, passwordResetStatusPending)
        if (latest != null) {
            if (latest.expiresAt.isBefore(now)) {
                latest.status = passwordResetStatusExpired
            } else {
                latest.attempts += 1
                if (latest.attempts >= passwordResetMaxAttempts) {
                    latest.status = passwordResetStatusExpired
                }
            }
            latest.updatedAt = now
            passwordResetCodeRepo.saveAndFlush(latest)
        }
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid password reset code.")
    }

    private fun PendingRegistrationEntity.toEmailCommand(token: String): RegistrationEmailCommand =
        RegistrationEmailCommand(
            to = emailNormalized,
            displayName = displayName,
            locale = locale,
            confirmationUrl = "${publicBaseUrl.trimEnd('/')}/register/confirm?token=$token",
            idempotencyKey = "registration:$id:$tokenHash",
        )

    private fun PasswordResetCodeEntity.toEmailCommand(code: String): PasswordResetEmailCommand =
        PasswordResetEmailCommand(
            to = emailNormalized,
            displayName = displayName,
            locale = locale,
            code = code,
            expiresMinutes = passwordResetCodeTtlMinutes,
            idempotencyKey = "password-reset:$id:$codeHash",
        )

    private fun newPasswordResetCode(): String =
        resetCodeRandom.nextInt(1_000_000).toString().padStart(6, '0')

    private fun passwordResetCodeHash(email: String, code: String): String =
        tokenService.hash("$email:${code.trim()}")

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

    private fun allowedReturnTo(value: String?): String? =
        returnToPolicy.allow(clean(value, 1024))

    private companion object {
        const val registrationStatusPending = "PENDING"
        const val registrationStatusConfirmed = "CONFIRMED"
        const val registrationStatusExpired = "EXPIRED"
        const val registrationStatusCheckEmail = "CHECK_EMAIL"
        const val registrationStatusPasswordReset = "PASSWORD_RESET"
        const val passwordResetStatusPending = "PENDING"
        const val passwordResetStatusConsumed = "CONSUMED"
        const val passwordResetStatusExpired = "EXPIRED"
        const val studentRole = "STUDENT"
        val passwordResetCodeRegex = Regex("\\d{6}")
    }
}
