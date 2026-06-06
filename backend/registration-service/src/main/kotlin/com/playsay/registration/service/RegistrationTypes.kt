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
)

data class KeycloakRegistrationUser(
    val email: String,
    val enabled: Boolean,
    val emailVerified: Boolean,
)

interface KeycloakRegistrationClient {
    fun createDisabledUser(command: KeycloakUserCreateCommand): Boolean

    fun findUserByEmail(email: String): KeycloakRegistrationUser?

    fun enableVerifiedUser(email: String)

    fun assignRealmRole(email: String, role: String)

    fun updatePassword(email: String, newPassword: String)
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
