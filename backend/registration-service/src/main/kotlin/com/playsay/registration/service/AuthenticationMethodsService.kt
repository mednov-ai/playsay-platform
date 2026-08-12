package com.playsay.registration.service

import java.time.Instant
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

data class AuthenticationMethods(
    val hasPassword: Boolean,
    val passkeys: List<PasskeyCredential>,
)

data class PasskeyCredential(
    val id: String,
    val label: String?,
    val createdAt: Instant?,
)

@Service
class AuthenticationMethodsService(
    private val keycloak: KeycloakRegistrationClient,
) {
    fun get(subject: String): AuthenticationMethods = methods(keycloak.listCredentials(subject))

    fun renamePasskey(subject: String, credentialId: String, requestedLabel: String): AuthenticationMethods {
        val label = requestedLabel.trim()
        if (label.isEmpty() || label.length > maxLabelLength) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Passkey label is invalid.")
        }
        requirePasskey(keycloak.listCredentials(subject), credentialId)
        keycloak.renameCredential(subject, credentialId, label)
        return get(subject)
    }

    fun deletePasskey(subject: String, credentialId: String): AuthenticationMethods {
        val credentials = keycloak.listCredentials(subject)
        requirePasskey(credentials, credentialId)
        val passkeys = credentials.filter { it.type == passwordlessCredentialType }
        val hasPassword = credentials.any { it.type == passwordCredentialType }
        if (!hasPassword && passkeys.size <= 1) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "The last available sign-in method cannot be removed.")
        }
        keycloak.deleteCredential(subject, credentialId)
        return get(subject)
    }

    private fun requirePasskey(credentials: List<KeycloakCredential>, credentialId: String): KeycloakCredential =
        credentials.firstOrNull { it.id == credentialId && it.type == passwordlessCredentialType }
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Passkey was not found.")

    private fun methods(credentials: List<KeycloakCredential>): AuthenticationMethods =
        AuthenticationMethods(
            hasPassword = credentials.any { it.type == passwordCredentialType },
            passkeys = credentials
                .filter { it.type == passwordlessCredentialType }
                .sortedWith(compareByDescending<KeycloakCredential> { it.createdAt }.thenBy { it.id })
                .map { PasskeyCredential(it.id, it.userLabel?.takeIf(String::isNotBlank), it.createdAt) },
        )

    private companion object {
        const val maxLabelLength = 64
        const val passwordCredentialType = "password"
        const val passwordlessCredentialType = "webauthn-passwordless"
    }
}
