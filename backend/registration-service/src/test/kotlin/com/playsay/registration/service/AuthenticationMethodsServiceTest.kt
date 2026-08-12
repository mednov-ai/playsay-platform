package com.playsay.registration.service

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

class AuthenticationMethodsServiceTest {
    @Test
    fun `returns only safe password and passwordless metadata`() {
        val keycloak = CredentialClient(
            mutableListOf(
                credential("password-id", "password"),
                credential("otp-id", "otp"),
                credential("passkey-id", "webauthn-passwordless", "iPhone"),
            ),
        )

        val methods = AuthenticationMethodsService(keycloak).get("subject-1")

        assertEquals(true, methods.hasPassword)
        assertEquals(listOf("passkey-id"), methods.passkeys.map { it.id })
        assertEquals("iPhone", methods.passkeys.single().label)
    }

    @Test
    fun `rename and delete are limited to owned passwordless credentials`() {
        val keycloak = CredentialClient(
            mutableListOf(
                credential("password-id", "password"),
                credential("passkey-id", "webauthn-passwordless", "This device"),
            ),
        )
        val service = AuthenticationMethodsService(keycloak)

        assertEquals("MacBook", service.renamePasskey("subject-1", "passkey-id", "  MacBook  ").passkeys.single().label)
        assertEquals(emptyList(), service.deletePasskey("subject-1", "passkey-id").passkeys)
        assertEquals(listOf("subject-1" to "passkey-id"), keycloak.deleted)

        val passwordError = assertFailsWith<ResponseStatusException> {
            service.renamePasskey("subject-1", "password-id", "Not allowed")
        }
        assertEquals(HttpStatus.NOT_FOUND, passwordError.statusCode)
    }

    @Test
    fun `cannot delete the last available sign-in method`() {
        val keycloak = CredentialClient(
            mutableListOf(credential("only-passkey", "webauthn-passwordless", "Phone")),
        )

        val error = assertFailsWith<ResponseStatusException> {
            AuthenticationMethodsService(keycloak).deletePasskey("subject-1", "only-passkey")
        }

        assertEquals(HttpStatus.CONFLICT, error.statusCode)
        assertEquals(emptyList(), keycloak.deleted)
    }

    private fun credential(id: String, type: String, label: String? = null) =
        KeycloakCredential(id, type, label, Instant.parse("2026-08-12T08:00:00Z"))
}

private class CredentialClient(
    private val credentials: MutableList<KeycloakCredential>,
) : KeycloakRegistrationClient {
    val deleted = mutableListOf<Pair<String, String>>()

    override fun listCredentials(subject: String): List<KeycloakCredential> = credentials.toList()

    override fun renameCredential(subject: String, credentialId: String, label: String) {
        val index = credentials.indexOfFirst { it.id == credentialId }
        credentials[index] = credentials[index].copy(userLabel = label)
    }

    override fun deleteCredential(subject: String, credentialId: String) {
        deleted += subject to credentialId
        credentials.removeIf { it.id == credentialId }
    }

    override fun createDisabledUser(command: KeycloakUserCreateCommand) = error("Not used")
    override fun findUserByUsername(username: String) = error("Not used")
    override fun findUserByEmail(email: String) = error("Not used")
    override fun enableVerifiedUser(username: String) = error("Not used")
    override fun assignRealmRole(username: String, role: String) = error("Not used")
    override fun updatePassword(username: String, newPassword: String) = error("Not used")
    override fun passwordGrant(username: String, password: String, clientId: String) = error("Not used")
}
