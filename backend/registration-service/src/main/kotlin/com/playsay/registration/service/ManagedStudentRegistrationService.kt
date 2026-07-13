package com.playsay.registration.service

import com.playsay.registration.entity.ManagedStudentInviteEntity
import com.playsay.registration.repo.ManagedStudentInviteRepo
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class ManagedStudentRegistrationService(
    private val managedStudentInviteRepo: ManagedStudentInviteRepo,
    private val keycloak: KeycloakRegistrationClient,
    private val tokenService: RegistrationTokenService,
    private val rateLimiter: InMemoryRegistrationRateLimiter,
    private val clock: Clock,
    @param:Value("\${playsay.registration.managed-student-invite-retention-days:30}") private val inviteRetentionDays: Long,
    @param:Value("\${playsay.registration.keycloak.student-token-client-id:playsay-web}") private val studentTokenClientId: String,
) {
    private val returnToPolicy = ReturnToUrlPolicy()

    @Transactional
    fun createManagedStudent(command: ManagedStudentCommand): ManagedStudentResult {
        val username = command.username.normalizedUsername()
        val firstName = clean(command.firstName, 120)
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "First name is required.")
        val lastName = clean(command.lastName, 120)
        val email = command.email.normalizedOptionalEmail()
        val existing = keycloak.findUserByUsername(username)
        val emailOwner = email?.let(keycloak::findUserByEmail)
        if (emailOwner != null && emailOwner.subject != existing?.subject) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Email already belongs to another account.")
        }
        if (existing != null) {
            if (!existing.managedStudent) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Username already belongs to a non-managed account.")
            }
            if (!existing.enabled || !existing.emailVerified) {
                keycloak.enableVerifiedUser(username)
            }
            keycloak.assignRealmRole(username, studentRole)
            return ManagedStudentResult(
                subject = existing.subject,
                username = existing.username,
                email = existing.email,
                firstName = firstName,
                lastName = lastName,
            )
        }

        val created = keycloak.createDisabledUser(
            KeycloakUserCreateCommand(
                username = username,
                email = email,
                password = newManagedStudentPassword(),
                firstName = firstName,
                lastName = lastName,
                enabled = true,
                emailVerified = email != null,
                managedStudent = true,
            ),
        )
        if (!created) {
            val duplicate = keycloak.findUserByUsername(username)
            if (duplicate?.managedStudent == true) {
                return ManagedStudentResult(
                    subject = duplicate.subject,
                    username = duplicate.username,
                    email = duplicate.email,
                    firstName = firstName,
                    lastName = lastName,
                )
            }
            throw ResponseStatusException(HttpStatus.CONFLICT, "Username already belongs to a non-managed account.")
        }

        val user = keycloak.findUserByUsername(username)
            ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Managed student was not found after provisioning.")
        keycloak.assignRealmRole(username, studentRole)
        return ManagedStudentResult(
            subject = user.subject,
            username = user.username,
            email = user.email,
            firstName = firstName,
            lastName = lastName,
        )
    }

    @Transactional
    fun createManagedStudentInvite(command: ManagedStudentInviteCommand): ManagedStudentInviteResult {
        val username = command.username.normalizedLoginIdentifier()
        val email = command.email.normalizedOptionalEmail()
        val continueUrl = allowedReturnTo(command.continueUrl)
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Continue URL is not allowed.")
        val now = Instant.now(clock)
        val token = newUniqueStudentInviteCode()
        val invite = ManagedStudentInviteEntity(
            id = UUID.randomUUID(),
            tokenHash = tokenService.hash(tokenService.normalizeStudentInviteCode(token)),
            keycloakSubject = command.subject.trim().takeIf { it.isNotEmpty() }
                ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Subject is required."),
            usernameNormalized = username,
            emailNormalized = email,
            displayName = clean(command.displayName, 120),
            lessonId = command.lessonId,
            continueUrl = continueUrl,
            status = managedInviteStatusPending,
            expiresAt = now.plusSeconds(inviteRetentionDays.coerceAtLeast(1) * secondsPerDay),
            createdAt = now,
            updatedAt = now,
        )
        managedStudentInviteRepo.saveAndFlush(invite)
        return ManagedStudentInviteResult(token = token, expiresAt = invite.expiresAt)
    }

    @Transactional(readOnly = true)
    fun lookupManagedStudentInvite(token: String, remoteAddress: String? = null): ManagedStudentInviteLookupResult {
        val invite = resolvePendingInvite(token, remoteAddress, lockForUpdate = false)
        return ManagedStudentInviteLookupResult(
            subject = invite.keycloakSubject,
            username = invite.usernameNormalized,
            email = invite.emailNormalized,
            displayName = invite.displayName,
            lessonId = invite.lessonId,
            continueUrl = invite.continueUrl,
            expiresAt = invite.expiresAt,
        )
    }

    @Transactional
    fun consumeManagedStudentInvite(token: String, remoteAddress: String? = null): ConsumeStudentInviteResult {
        val invite = resolvePendingInvite(token, remoteAddress, lockForUpdate = true)
        val now = Instant.now(clock)

        if (invite.createdAt.plusSeconds(inviteRetentionDays.coerceAtLeast(1) * secondsPerDay).isBefore(now)) {
            invite.status = managedInviteStatusExpired
            invite.updatedAt = now
            managedStudentInviteRepo.saveAndFlush(invite)
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Student invite token expired.")
        }

        val password = newManagedStudentPassword()
        keycloak.enableVerifiedUser(invite.usernameNormalized)
        keycloak.assignRealmRole(invite.usernameNormalized, studentRole)
        keycloak.updatePassword(invite.usernameNormalized, password)
        val tokens = keycloak.passwordGrant(invite.usernameNormalized, password, studentTokenClientId)

        invite.status = managedInviteStatusConsumed
        invite.consumedAt = now
        invite.updatedAt = now
        managedStudentInviteRepo.saveAndFlush(invite)
        return ConsumeStudentInviteResult(
            accessToken = tokens.accessToken,
            refreshToken = tokens.refreshToken,
            idToken = tokens.idToken,
            expiresIn = tokens.expiresIn,
            continueUrl = invite.continueUrl,
        )
    }

    private fun resolvePendingInvite(
        token: String,
        remoteAddress: String?,
        lockForUpdate: Boolean,
    ): ManagedStudentInviteEntity {
        val submittedToken = token.trim()
        val normalizedToken = tokenService.normalizeStudentInviteCode(submittedToken)
        rateLimiter.check("student-invite:$normalizedToken", remoteAddress)
        return pendingInviteByToken(normalizedToken, lockForUpdate)
            ?: submittedToken.takeIf { it != normalizedToken }?.let { pendingInviteByToken(it, lockForUpdate) }
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid student invite token.")
    }

    private fun newUniqueStudentInviteCode(): String {
        repeat(studentInviteCodeGenerationAttempts) {
            val token = tokenService.newStudentInviteCode()
            if (!managedStudentInviteRepo.existsByTokenHash(tokenService.hash(tokenService.normalizeStudentInviteCode(token)))) {
                return token
            }
        }
        throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not allocate invite code.")
    }

    private fun pendingInviteByToken(token: String, lockForUpdate: Boolean): ManagedStudentInviteEntity? {
        val tokenHash = tokenService.hash(token)
        return if (lockForUpdate) {
            managedStudentInviteRepo.findByTokenHashAndStatus(tokenHash, managedInviteStatusPending)
        } else {
            managedStudentInviteRepo.findPendingLookupByTokenHashAndStatus(tokenHash, managedInviteStatusPending)
        }
    }

    private fun newManagedStudentPassword(): String =
        "Aa1!${tokenService.newToken()}"

    private fun String.normalizedEmail(): String =
        trim().lowercase().takeIf { it.isNotBlank() }
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is required.")

    private fun String.normalizedUsername(): String {
        val normalized = trim().lowercase()
        if (!managedStudentUsernameRegex.matches(normalized)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Username format is invalid.")
        }
        return normalized
    }

    private fun String.normalizedLoginIdentifier(): String =
        trim().lowercase().takeIf { it.isNotBlank() }
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Username is required.")

    private fun String?.normalizedOptionalEmail(): String? =
        this?.trim()?.takeIf { it.isNotEmpty() }?.normalizedEmail()

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
        const val managedInviteStatusPending = "PENDING"
        const val managedInviteStatusConsumed = "CONSUMED"
        const val managedInviteStatusExpired = "EXPIRED"
        const val studentRole = "STUDENT"
        const val studentInviteCodeGenerationAttempts = 10
        const val secondsPerDay: Long = 24 * 60 * 60
        val managedStudentUsernameRegex = Regex("^[a-z0-9._-]{3,64}$")
    }
}
