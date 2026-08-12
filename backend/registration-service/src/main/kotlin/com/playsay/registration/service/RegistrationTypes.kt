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
    val username: String,
    val email: String?,
    val password: String,
    val firstName: String,
    val lastName: String?,
    val enabled: Boolean,
    val emailVerified: Boolean,
    val managedStudent: Boolean = false,
    val temporaryPassword: Boolean = false,
    val requiredActions: List<String> = emptyList(),
)

data class KeycloakRegistrationUser(
    val username: String,
    val email: String?,
    val enabled: Boolean,
    val emailVerified: Boolean,
    val subject: String = username,
    val managedStudent: Boolean = false,
    val displayName: String? = null,
    val roles: Set<String> = emptySet(),
)

data class ManagedStudentCommand(
    val username: String,
    val firstName: String,
    val lastName: String?,
    val email: String?,
)

data class ManagedStudentResult(
    val subject: String,
    val username: String,
    val email: String?,
    val firstName: String,
    val lastName: String?,
)

data class ManagedStudentInviteCommand(
    val subject: String,
    val username: String,
    val email: String?,
    val displayName: String?,
    val lessonId: java.util.UUID,
    val continueUrl: String,
)

data class ManagedStudentInviteResult(
    val token: String,
    val expiresAt: java.time.Instant,
)

data class ManagedStudentInviteLookupResult(
    val subject: String,
    val username: String,
    val email: String?,
    val displayName: String?,
    val lessonId: java.util.UUID,
    val continueUrl: String,
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

    fun findUserByUsername(username: String): KeycloakRegistrationUser?

    fun findUserByEmail(email: String): KeycloakRegistrationUser?

    fun enableVerifiedUser(username: String)

    fun assignRealmRole(username: String, role: String)

    fun updatePassword(username: String, newPassword: String)

    fun passwordGrant(username: String, password: String, clientId: String): KeycloakTokenSet

    fun findUserBySubject(subject: String): KeycloakRegistrationUser? = null

    fun setRealmRoles(subject: String, roles: Set<String>) {
        error("Realm role management is not supported by this Keycloak client.")
    }

    fun deleteUser(subject: String) {
        error("User deletion is not supported by this Keycloak client.")
    }

    fun sendRequiredActionsEmail(subject: String, actions: List<String>) {
        error("Required actions email is not supported by this Keycloak client.")
    }

    fun listCredentials(subject: String): List<KeycloakCredential> {
        error("Credential management is not supported by this Keycloak client.")
    }

    fun renameCredential(subject: String, credentialId: String, label: String) {
        error("Credential management is not supported by this Keycloak client.")
    }

    fun deleteCredential(subject: String, credentialId: String) {
        error("Credential management is not supported by this Keycloak client.")
    }
}

data class KeycloakCredential(
    val id: String,
    val type: String,
    val userLabel: String?,
    val createdAt: java.time.Instant?,
)

data class RegistrationEmailCommand(
    val to: String,
    val displayName: String?,
    val locale: String,
    val confirmationUrl: String,
    val idempotencyKey: String,
    val replayUntil: java.time.Instant,
)

data class PasswordResetEmailCommand(
    val to: String,
    val displayName: String?,
    val locale: String,
    val code: String,
    val expiresMinutes: Long,
    val resetUrl: String,
    val idempotencyKey: String,
    val replayUntil: java.time.Instant,
)

interface RegistrationEmailClient {
    fun sendRegistrationConfirmation(command: RegistrationEmailCommand)

    fun sendPasswordResetCode(command: PasswordResetEmailCommand)
}
