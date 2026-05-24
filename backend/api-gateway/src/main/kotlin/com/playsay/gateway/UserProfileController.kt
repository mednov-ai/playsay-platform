package com.playsay.gateway

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
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
    val id: UUID,
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
class UserProfileStore(
    private val jdbcClient: JdbcClient,
) {
    @Transactional
    fun current(authentication: JwtAuthenticationToken): UserProfileResponse {
        val identity = authentication.toIdentity()
        val existing = findBySubject(identity.subject)
        val profile = if (existing == null) {
            insertProfile(identity)
        } else {
            updateIdentity(existing.id, identity)
            requireNotNull(findBySubject(identity.subject))
        }

        return profile.toResponse()
    }

    @Transactional
    fun update(authentication: JwtAuthenticationToken, request: UpdateUserProfileRequest): UserProfileResponse {
        val identity = authentication.toIdentity()
        val profile = findBySubject(identity.subject) ?: insertProfile(identity)
        val updatedAt = Instant.now()

        jdbcClient.sql(
            """
            UPDATE app_user
               SET username = :username,
                   email = :email,
                   name = :name,
                   roles = :roles,
                   display_name = :displayName,
                   locale = :locale,
                   timezone = :timezone,
                   learning_goal = :learningGoal,
                   updated_at = :updatedAt
             WHERE id = :id
            """.trimIndent(),
        )
            .param("id", profile.id)
            .param("username", identity.username)
            .param("email", identity.email)
            .param("name", identity.name)
            .param("roles", identity.roles.toStoredRoles())
            .param("displayName", clean(request.displayName, 120))
            .param("locale", clean(request.locale, 16))
            .param("timezone", clean(request.timezone, 64))
            .param("learningGoal", clean(request.learningGoal, 500))
            .param("updatedAt", updatedAt.toOffsetDateTime())
            .update()

        return requireNotNull(findBySubject(identity.subject)).toResponse()
    }

    @Transactional
    fun deleteCurrent(authentication: JwtAuthenticationToken) {
        val identity = authentication.toIdentity()
        val profile = findBySubject(identity.subject) ?: return

        jdbcClient.sql(
            """
            UPDATE app_user
               SET username = :username,
                   email = :email,
                   name = :name,
                   roles = :roles,
                   display_name = :displayName,
                   locale = NULL,
                   timezone = NULL,
                   learning_goal = NULL,
                   updated_at = :updatedAt
             WHERE id = :id
            """.trimIndent(),
        )
            .param("id", profile.id)
            .param("username", identity.username)
            .param("email", identity.email)
            .param("name", identity.name)
            .param("roles", identity.roles.toStoredRoles())
            .param("displayName", identity.defaultDisplayName())
            .param("updatedAt", Instant.now().toOffsetDateTime())
            .update()
    }

    @Transactional(readOnly = true)
    fun list(): List<UserProfileResponse> =
        jdbcClient.sql(
            """
            SELECT id,
                   keycloak_subject,
                   username,
                   email,
                   name,
                   roles,
                   display_name,
                   locale,
                   timezone,
                   learning_goal,
                   updated_at
              FROM app_user
             ORDER BY COALESCE(username, keycloak_subject)
            """.trimIndent(),
        )
            .query(::mapProfile)
            .list()
            .map { profile -> profile.toResponse() }

    private fun clean(value: String?, maxLength: Int): String? {
        val cleaned = value?.trim()?.takeIf { it.isNotEmpty() }
        if (cleaned != null && cleaned.length > maxLength) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Field length must be at most $maxLength characters.")
        }
        return cleaned
    }

    private fun insertProfile(identity: CurrentIdentity): StoredUserProfile {
        val now = Instant.now()
        val id = UUID.randomUUID()
        val profile = StoredUserProfile(
            id = id,
            subject = identity.subject,
            username = identity.username,
            email = identity.email,
            name = identity.name,
            roles = identity.roles,
            displayName = identity.defaultDisplayName(),
            locale = null,
            timezone = null,
            learningGoal = null,
            updatedAt = now,
        )

        jdbcClient.sql(
            """
            INSERT INTO app_user (
                id,
                keycloak_subject,
                username,
                email,
                name,
                roles,
                display_name,
                locale,
                timezone,
                learning_goal,
                created_at,
                updated_at
            ) VALUES (
                :id,
                :subject,
                :username,
                :email,
                :name,
                :roles,
                :displayName,
                :locale,
                :timezone,
                :learningGoal,
                :createdAt,
                :updatedAt
            )
            """.trimIndent(),
        )
            .param("id", id)
            .param("subject", identity.subject)
            .param("username", identity.username)
            .param("email", identity.email)
            .param("name", identity.name)
            .param("roles", identity.roles.toStoredRoles())
            .param("displayName", profile.displayName)
            .param("locale", profile.locale)
            .param("timezone", profile.timezone)
            .param("learningGoal", profile.learningGoal)
            .param("createdAt", now.toOffsetDateTime())
            .param("updatedAt", now.toOffsetDateTime())
            .update()

        return profile
    }

    private fun updateIdentity(id: UUID, identity: CurrentIdentity) {
        jdbcClient.sql(
            """
            UPDATE app_user
               SET username = :username,
                   email = :email,
                   name = :name,
                   roles = :roles
             WHERE id = :id
            """.trimIndent(),
        )
            .param("id", id)
            .param("username", identity.username)
            .param("email", identity.email)
            .param("name", identity.name)
            .param("roles", identity.roles.toStoredRoles())
            .update()
    }

    private fun findBySubject(subject: String): StoredUserProfile? =
        jdbcClient.sql(
            """
            SELECT id,
                   keycloak_subject,
                   username,
                   email,
                   name,
                   roles,
                   display_name,
                   locale,
                   timezone,
                   learning_goal,
                   updated_at
              FROM app_user
             WHERE keycloak_subject = :subject
            """.trimIndent(),
        )
            .param("subject", subject)
            .query(::mapProfile)
            .optional()
            .orElse(null)
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

private fun mapProfile(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): StoredUserProfile =
    StoredUserProfile(
        id = rs.getObject("id", UUID::class.java),
        subject = rs.getString("keycloak_subject"),
        username = rs.getString("username"),
        email = rs.getString("email"),
        name = rs.getString("name"),
        roles = rs.getString("roles").toApplicationRoles(),
        displayName = rs.getString("display_name"),
        locale = rs.getString("locale"),
        timezone = rs.getString("timezone"),
        learningGoal = rs.getString("learning_goal"),
        updatedAt = rs.getInstant("updated_at"),
    )

private fun ResultSet.getInstant(columnName: String): Instant =
    getObject(columnName, OffsetDateTime::class.java).toInstant()

private fun Instant.toOffsetDateTime(): OffsetDateTime =
    atOffset(ZoneOffset.UTC)

private fun CurrentIdentity.defaultDisplayName(): String? =
    name ?: username

private fun List<String>.toStoredRoles(): String =
    joinToString(",")

private fun String?.toApplicationRoles(): List<String> =
    this
        ?.split(",")
        ?.mapNotNull { role -> role.trim().takeIf { it.isNotEmpty() } }
        ?.sorted()
        ?: emptyList()
