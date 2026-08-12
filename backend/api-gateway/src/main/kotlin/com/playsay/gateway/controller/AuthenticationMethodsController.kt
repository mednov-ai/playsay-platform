package com.playsay.gateway.controller

import com.playsay.gateway.dto.AuthenticationMethodsResponse
import com.playsay.gateway.dto.RenamePasskeyRequest
import com.playsay.gateway.service.RegistrationGateway
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Authentication methods")
class AuthenticationMethodsController(
    private val registration: RegistrationGateway,
) {
    @GetMapping("/users/me/authentication-methods", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getMyAuthenticationMethods",
        summary = "Current user's sign-in methods",
        description = "Returns password availability and safe metadata for the current user's passwordless Passkeys.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Current sign-in methods"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
        ],
    )
    fun get(authentication: JwtAuthenticationToken): AuthenticationMethodsResponse =
        registration.authenticationMethods(authentication.token.subject)

    @PutMapping(
        "/users/me/authentication-methods/passkeys/{credentialId}",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "renameMyPasskey",
        summary = "Rename current user's Passkey",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun rename(
        authentication: JwtAuthenticationToken,
        @PathVariable credentialId: String,
        @Valid @RequestBody request: RenamePasskeyRequest,
    ): AuthenticationMethodsResponse =
        registration.renamePasskey(authentication.token.subject, credentialId, request)

    @DeleteMapping(
        "/users/me/authentication-methods/passkeys/{credentialId}",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "deleteMyPasskey",
        summary = "Delete current user's Passkey",
        description = "Deletes a passwordless Passkey owned by the current user without exposing Keycloak administration.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun delete(
        authentication: JwtAuthenticationToken,
        @PathVariable credentialId: String,
    ): AuthenticationMethodsResponse = registration.deletePasskey(authentication.token.subject, credentialId)
}
