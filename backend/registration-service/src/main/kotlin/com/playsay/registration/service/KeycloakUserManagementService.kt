package com.playsay.registration.service

import com.playsay.registration.repo.ManagedStudentInviteRepo
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

data class KeycloakManagedIdentity(
    val subject: String,
    val username: String,
    val email: String?,
    val displayName: String?,
    val roles: Set<String>,
    val enabled: Boolean,
    val emailVerified: Boolean,
)

data class CreateKeycloakManagedIdentityCommand(
    val username: String,
    val firstName: String,
    val lastName: String?,
    val email: String?,
    val roles: Set<String>,
    val managedStudent: Boolean,
)

@Service
class KeycloakUserManagementService(
    private val keycloak: KeycloakRegistrationClient,
    private val inviteRepo: ManagedStudentInviteRepo,
) {
    fun findExact(identifier: String): KeycloakManagedIdentity? {
        val normalized = identifier.trim()
        val user = if ('@' in normalized) keycloak.findUserByEmail(normalized) else keycloak.findUserByUsername(normalized)
        return user?.let { keycloak.findUserBySubject(it.subject) ?: it }?.toManagedIdentity()
    }

    fun create(command: CreateKeycloakManagedIdentityCommand): KeycloakManagedIdentity {
        validateRoles(command.roles)
        if (keycloak.findUserByUsername(command.username) != null || command.email?.let(keycloak::findUserByEmail) != null) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "User identity already exists.")
        }
        val staff = studentRole !in command.roles
        if (staff && command.email.isNullOrBlank()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Staff email is required.")
        }
        val created = keycloak.createDisabledUser(
            KeycloakUserCreateCommand(
                username = command.username.trim().lowercase(),
                email = command.email?.trim()?.lowercase(),
                password = "Aa1!${UUID.randomUUID()}x",
                firstName = command.firstName.trim(),
                lastName = command.lastName?.trim()?.takeIf(String::isNotEmpty),
                enabled = true,
                emailVerified = command.email == null,
                managedStudent = command.managedStudent,
                temporaryPassword = staff,
                requiredActions = if (staff) listOf("VERIFY_EMAIL", "UPDATE_PASSWORD") else emptyList(),
            ),
        )
        if (!created) throw ResponseStatusException(HttpStatus.CONFLICT, "User identity already exists.")
        val createdUser = keycloak.findUserByUsername(command.username)
            ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Created identity was not found.")
        keycloak.setRealmRoles(createdUser.subject, command.roles)
        if (staff && command.email != null) {
            keycloak.sendRequiredActionsEmail(createdUser.subject, listOf("VERIFY_EMAIL", "UPDATE_PASSWORD"))
        }
        return (keycloak.findUserBySubject(createdUser.subject) ?: createdUser.copy(roles = command.roles)).toManagedIdentity()
    }

    fun updateRoles(subject: String, roles: Set<String>): KeycloakManagedIdentity {
        validateRoles(roles)
        val existing = keycloak.findUserBySubject(subject)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "User identity was not found.")
        keycloak.setRealmRoles(subject, roles)
        return existing.copy(roles = roles).toManagedIdentity()
    }

    @Transactional
    fun delete(subject: String) {
        inviteRepo.deleteByKeycloakSubject(subject)
        keycloak.deleteUser(subject)
    }

    private fun validateRoles(roles: Set<String>) {
        if (roles.isEmpty() || roles.any { it !in applicationRoles } ||
            (studentRole in roles && roles.size != 1) ||
            (studentRole !in roles && teacherRole !in roles && adminRole !in roles)
        ) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Role combination is invalid.")
        }
    }

    private fun KeycloakRegistrationUser.toManagedIdentity(): KeycloakManagedIdentity =
        KeycloakManagedIdentity(subject, username, email, displayName, roles, enabled, emailVerified)

    private companion object {
        const val studentRole = "STUDENT"
        const val teacherRole = "TEACHER"
        const val adminRole = "ADMIN"
        val applicationRoles = setOf(studentRole, teacherRole, adminRole)
    }
}
