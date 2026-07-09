package com.playsay.registration.service

data class StartRegistrationCommand(
    val email: String,
    val password: String,
    val displayName: String?,
    val locale: String?,
    val returnTo: String?,
    val remoteAddress: String?,
)

data class ResendRegistrationCommand(
    val email: String,
    val locale: String?,
    val returnTo: String?,
    val remoteAddress: String?,
)

data class ForgotPasswordCommand(
    val email: String,
    val locale: String?,
    val returnTo: String?,
    val remoteAddress: String?,
)

data class ResetPasswordCommand(
    val email: String,
    val code: String,
    val newPassword: String,
    val remoteAddress: String?,
)

data class RegistrationResult(
    val status: String,
    val continueUrl: String? = null,
)

data class KeycloakUserCreateCommand(
    val email: String,
    val password: String,
    val displayName: String?,
    val enabled: Boolean,
    val emailVerified: Boolean,
    val managedStudent: Boolean = false,
)

data class KeycloakRegistrationUser(
    val email: String,
    val enabled: Boolean,
    val emailVerified: Boolean,
    val subject: String = email,
    val managedStudent: Boolean = false,
)

data class ManagedStudentCommand(
    val email: String,
    val displayName: String,
)

data class ManagedStudentResult(
    val subject: String,
    val email: String,
    val displayName: String?,
)

data class ManagedStudentInviteCommand(
    val subject: String,
    val email: String,
    val displayName: String?,
    val lessonId: java.util.UUID,
    val continueUrl: String,
)

data class ManagedStudentInviteResult(
    val token: String,
    val expiresAt: java.time.Instant,
)

data class ConsumeStudentInviteResult(
    val accessToken: String,
    val refreshToken: String?,
    val idToken: String?,
    val expiresIn: Long,
    val continueUrl: String,
)

data class KeycloakTokenSet(
    val accessToken: String,
    val refreshToken: String?,
    val idToken: String?,
    val expiresIn: Long,
)

interface KeycloakRegistrationClient {
    fun createDisabledUser(command: KeycloakUserCreateCommand): Boolean

    fun findUserByEmail(email: String): KeycloakRegistrationUser?

    fun enableVerifiedUser(email: String)

    fun assignRealmRole(email: String, role: String)

    fun updatePassword(email: String, newPassword: String)

    fun passwordGrant(email: String, password: String, clientId: String): KeycloakTokenSet
}

data class RegistrationEmailCommand(
    val to: String,
    val displayName: String?,
    val locale: String,
    val confirmationUrl: String,
    val idempotencyKey: String,
)

data class PasswordResetEmailCommand(
    val to: String,
    val displayName: String?,
    val locale: String,
    val code: String,
    val expiresMinutes: Long,
    val idempotencyKey: String,
)

interface RegistrationEmailClient {
    fun sendRegistrationConfirmation(command: RegistrationEmailCommand)

    fun sendPasswordResetCode(command: PasswordResetEmailCommand)
}
