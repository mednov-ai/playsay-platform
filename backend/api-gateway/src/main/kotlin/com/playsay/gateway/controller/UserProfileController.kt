package com.playsay.gateway.controller

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
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.error.ProjectResponseException

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
        if (authentication.authorities.none { authority -> authority.authority == MetaData.Authorities.ADMIN }) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.ADMIN_ROLE_REQUIRED)
        }
        return store.list()
    }

    @GetMapping("/users/students", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listStudentProfiles",
        summary = "List student user profiles",
        description = "Returns known app-level student profiles. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Known student user profiles"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user is not a teacher/admin", content = [Content()]),
        ],
    )
    fun listStudents(authentication: JwtAuthenticationToken): List<UserProfileResponse> {
        if (authentication.authorities.none { authority ->
            authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN
        }) {
            throw ProjectResponseException.localized(
                HttpStatus.FORBIDDEN,
                MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED,
            )
        }
        return store.listStudents()
    }
}
