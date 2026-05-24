package com.playsay.gateway

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

data class MeResponse(
    val subject: String,
    val username: String?,
    val email: String?,
    val name: String?,
    val roles: List<String>,
)

@RestController
@Tag(name = "Auth")
class MeController {
    @GetMapping("/me", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getMe",
        summary = "Current user profile",
        description = "Returns the current JWT profile and Play&Say application roles.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Current user profile"),
            ApiResponse(
                responseCode = "401",
                description = "Missing or invalid bearer token",
                content = [Content()],
            ),
        ],
    )
    fun me(authentication: JwtAuthenticationToken): MeResponse {
        val jwt = authentication.token
        val roles = authentication.authorities
            .mapNotNull { authority -> authority.authority }
            .filter { authority -> authority.startsWith("ROLE_") }
            .map { authority -> authority.removePrefix("ROLE_") }
            .sorted()

        return MeResponse(
            subject = jwt.subject,
            username = jwt.getClaimAsString("preferred_username"),
            email = jwt.getClaimAsString("email"),
            name = jwt.getClaimAsString("name"),
            roles = roles,
        )
    }
}
