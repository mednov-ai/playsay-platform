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

interface KeycloakRegistrationClient {
    fun createDisabledUser(command: KeycloakUserCreateCommand): Boolean

    fun enableVerifiedUser(email: String)

    fun assignRealmRole(email: String, role: String)
}

data class RegistrationEmailCommand(
    val to: String,
    val displayName: String?,
    val locale: String,
    val confirmationUrl: String,
    val idempotencyKey: String,
)

interface RegistrationEmailClient {
    fun sendRegistrationConfirmation(command: RegistrationEmailCommand)
}
