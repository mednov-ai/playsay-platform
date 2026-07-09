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
        val email = command.email.normalizedEmail()
        val displayName = clean(command.displayName, 120)
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Display name is required.")
        val existing = keycloak.findUserByEmail(email)
        if (existing != null) {
            if (!existing.managedStudent) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Email already belongs to a non-managed account.")
            }
            if (!existing.enabled || !existing.emailVerified) {
                keycloak.enableVerifiedUser(email)
            }
            keycloak.assignRealmRole(email, studentRole)
            return ManagedStudentResult(
                subject = existing.subject,
                email = existing.email,
                displayName = displayName,
            )
        }

        val created = keycloak.createDisabledUser(
            KeycloakUserCreateCommand(
                email = email,
                password = newManagedStudentPassword(),
                displayName = displayName,
                enabled = true,
                emailVerified = true,
                managedStudent = true,
            ),
        )
        if (!created) {
            val duplicate = keycloak.findUserByEmail(email)
            if (duplicate?.managedStudent == true) {
                return ManagedStudentResult(
                    subject = duplicate.subject,
                    email = duplicate.email,
                    displayName = displayName,
                )
            }
            throw ResponseStatusException(HttpStatus.CONFLICT, "Email already belongs to a non-managed account.")
        }

        val user = keycloak.findUserByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Managed student was not found after provisioning.")
        keycloak.assignRealmRole(email, studentRole)
        return ManagedStudentResult(
            subject = user.subject,
            email = user.email,
            displayName = displayName,
        )
    }

    @Transactional
    fun createManagedStudentInvite(command: ManagedStudentInviteCommand): ManagedStudentInviteResult {
        val email = command.email.normalizedEmail()
        val continueUrl = allowedReturnTo(command.continueUrl)
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Continue URL is not allowed.")
        val now = Instant.now(clock)
        val token = newUniqueStudentInviteCode()
        val invite = ManagedStudentInviteEntity(
            id = UUID.randomUUID(),
            tokenHash = tokenService.hash(tokenService.normalizeStudentInviteCode(token)),
            keycloakSubject = command.subject.trim().takeIf { it.isNotEmpty() }
                ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Subject is required."),
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
        val invite = resolvePendingInvite(token, remoteAddress)
        return ManagedStudentInviteLookupResult(
            subject = invite.keycloakSubject,
            email = invite.emailNormalized,
            displayName = invite.displayName,
            lessonId = invite.lessonId,
            continueUrl = invite.continueUrl,
            expiresAt = invite.expiresAt,
        )
    }

    @Transactional
    fun consumeManagedStudentInvite(token: String, remoteAddress: String? = null): ConsumeStudentInviteResult {
        val invite = resolvePendingInvite(token, remoteAddress)
        val now = Instant.now(clock)

        if (invite.createdAt.plusSeconds(inviteRetentionDays.coerceAtLeast(1) * secondsPerDay).isBefore(now)) {
            invite.status = managedInviteStatusExpired
            invite.updatedAt = now
            managedStudentInviteRepo.saveAndFlush(invite)
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Student invite token expired.")
        }

        val password = newManagedStudentPassword()
        keycloak.enableVerifiedUser(invite.emailNormalized)
        keycloak.assignRealmRole(invite.emailNormalized, studentRole)
        keycloak.updatePassword(invite.emailNormalized, password)
        val tokens = keycloak.passwordGrant(invite.emailNormalized, password, studentTokenClientId)

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

    private fun resolvePendingInvite(token: String, remoteAddress: String?): ManagedStudentInviteEntity {
        val submittedToken = token.trim()
        val normalizedToken = tokenService.normalizeStudentInviteCode(submittedToken)
        rateLimiter.check("student-invite:$normalizedToken", remoteAddress)
        return pendingInviteByToken(normalizedToken)
            ?: submittedToken.takeIf { it != normalizedToken }?.let(::pendingInviteByToken)
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

    private fun pendingInviteByToken(token: String): ManagedStudentInviteEntity? =
        managedStudentInviteRepo.findByTokenHashAndStatus(
            tokenService.hash(token),
            managedInviteStatusPending,
        )

    private fun newManagedStudentPassword(): String =
        "Aa1!${tokenService.newToken()}"

    private fun String.normalizedEmail(): String =
        trim().lowercase().takeIf { it.isNotBlank() }
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is required.")

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
    }
}
