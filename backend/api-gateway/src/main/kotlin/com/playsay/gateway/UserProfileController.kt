package com.playsay.gateway

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class UserProfileResponse(
    val subject: String,
    val username: String?,
    val email: String?,
    val name: String?,
    val roles: List<String>,
    val displayName: String?,
    val locale: String?,
    val timezone: String?,
    val learningGoal: String?,
    val updatedAt: Instant,
)

data class UpdateUserProfileRequest(
    @field:Schema(maxLength = 120)
    val displayName: String? = null,
    @field:Schema(maxLength = 16)
    val locale: String? = null,
    @field:Schema(maxLength = 64)
    val timezone: String? = null,
    @field:Schema(maxLength = 500)
    val learningGoal: String? = null,
)

private data class StoredUserProfile(
    val subject: String,
    val username: String?,
    val email: String?,
    val name: String?,
    val roles: List<String>,
    val displayName: String?,
    val locale: String?,
    val timezone: String?,
    val learningGoal: String?,
    val updatedAt: Instant,
)

@Component
class UserProfileStore {
    private val profiles = ConcurrentHashMap<String, StoredUserProfile>()

    fun current(authentication: JwtAuthenticationToken): UserProfileResponse {
        val identity = authentication.toIdentity()
        return profiles.compute(identity.subject) { _, existing ->
            val now = Instant.now()
            existing?.copy(
                username = identity.username,
                email = identity.email,
                name = identity.name,
                roles = identity.roles,
            ) ?: StoredUserProfile(
                subject = identity.subject,
                username = identity.username,
                email = identity.email,
                name = identity.name,
                roles = identity.roles,
                displayName = identity.name ?: identity.username,
                locale = null,
                timezone = null,
                learningGoal = null,
                updatedAt = now,
            )
        }!!.toResponse()
    }

    fun update(authentication: JwtAuthenticationToken, request: UpdateUserProfileRequest): UserProfileResponse {
        val identity = authentication.toIdentity()
        return profiles.compute(identity.subject) { _, existing ->
            val base = existing ?: StoredUserProfile(
                subject = identity.subject,
                username = identity.username,
                email = identity.email,
                name = identity.name,
                roles = identity.roles,
                displayName = identity.name ?: identity.username,
                locale = null,
                timezone = null,
                learningGoal = null,
                updatedAt = Instant.now(),
            )

            base.copy(
                username = identity.username,
                email = identity.email,
                name = identity.name,
                roles = identity.roles,
                displayName = clean(request.displayName, 120),
                locale = clean(request.locale, 16),
                timezone = clean(request.timezone, 64),
                learningGoal = clean(request.learningGoal, 500),
                updatedAt = Instant.now(),
            )
        }!!.toResponse()
    }

    fun deleteCurrent(authentication: JwtAuthenticationToken) {
        profiles.remove(authentication.token.subject)
    }

    fun list(): List<UserProfileResponse> =
        profiles.values
            .map { profile -> profile.toResponse() }
            .sortedBy { profile -> profile.username ?: profile.subject }

    private fun clean(value: String?, maxLength: Int): String? {
        val cleaned = value?.trim()?.takeIf { it.isNotEmpty() }
        if (cleaned != null && cleaned.length > maxLength) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Field length must be at most $maxLength characters.")
        }
        return cleaned
    }
}

@RestController
@Tag(name = "Users")
class UserProfileController(
    private val store: UserProfileStore,
) {
    @GetMapping("/users/me/profile", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getMyUserProfile",
        summary = "Current application user profile",
        description = "Returns the app-level profile for the current Keycloak user.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Current app-level user profile"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
        ],
    )
    fun current(authentication: JwtAuthenticationToken): UserProfileResponse =
        store.current(authentication)

    @PutMapping(
        "/users/me/profile",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "updateMyUserProfile",
        summary = "Update current application user profile",
        description = "Updates editable profile fields for the current Keycloak user.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Updated app-level user profile"),
            ApiResponse(responseCode = "400", description = "Invalid profile payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
        ],
    )
    fun update(
        authentication: JwtAuthenticationToken,
        @RequestBody request: UpdateUserProfileRequest,
    ): UserProfileResponse =
        store.update(authentication, request)

    @DeleteMapping("/users/me/profile")
    @Operation(
        operationId = "deleteMyUserProfile",
        summary = "Delete current application user profile",
        description = "Deletes editable app-level profile data for the current Keycloak user.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "204", description = "Current app-level user profile deleted"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
        ],
    )
    fun delete(authentication: JwtAuthenticationToken): ResponseEntity<Void> {
        store.deleteCurrent(authentication)
        return ResponseEntity.noContent().build()
    }

    @GetMapping("/admin/users", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listUserProfiles",
        summary = "List application user profiles",
        description = "Returns known app-level user profiles. Requires the ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Known app-level user profiles"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user is not an admin", content = [Content()]),
        ],
    )
    fun list(authentication: JwtAuthenticationToken): List<UserProfileResponse> {
        if (authentication.authorities.none { authority -> authority.authority == "ROLE_ADMIN" }) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "ADMIN role is required.")
        }
        return store.list()
    }
}

private data class CurrentIdentity(
    val subject: String,
    val username: String?,
    val email: String?,
    val name: String?,
    val roles: List<String>,
)

private fun JwtAuthenticationToken.toIdentity(): CurrentIdentity =
    CurrentIdentity(
        subject = token.subject,
        username = token.getClaimAsString("preferred_username"),
        email = token.getClaimAsString("email"),
        name = token.getClaimAsString("name"),
        roles = applicationRoles(),
    )

private fun JwtAuthenticationToken.applicationRoles(): List<String> =
    authorities
        .mapNotNull { authority -> authority.authority }
        .filter { authority -> authority.startsWith("ROLE_") }
        .map { authority -> authority.removePrefix("ROLE_") }
        .sorted()

private fun StoredUserProfile.toResponse(): UserProfileResponse =
    UserProfileResponse(
        subject = subject,
        username = username,
        email = email,
        name = name,
        roles = roles,
        displayName = displayName,
        locale = locale,
        timezone = timezone,
        learningGoal = learningGoal,
        updatedAt = updatedAt,
    )
