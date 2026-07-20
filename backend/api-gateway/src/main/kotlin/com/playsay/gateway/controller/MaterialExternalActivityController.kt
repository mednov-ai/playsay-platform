package com.playsay.gateway.controller

import com.playsay.gateway.dto.MaterialExternalActivityResolveRequest
import com.playsay.gateway.dto.MaterialExternalActivityResolveResponse
import com.playsay.gateway.service.MaterialExternalActivityResolver
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Materials")
class MaterialExternalActivityController(
    private val resolver: MaterialExternalActivityResolver,
) {
    @PostMapping(
        "/materials/external-activities/resolve",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "resolveMaterialExternalActivity",
        summary = "Validate and classify an external classroom activity URL",
        description = "Normalizes the URL without requesting the remote website.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Resolved external activity"),
            ApiResponse(responseCode = "400", description = "Invalid or blocked URL"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token"),
        ],
    )
    fun resolve(
        @Suppress("UNUSED_PARAMETER") authentication: JwtAuthenticationToken,
        @RequestBody request: MaterialExternalActivityResolveRequest,
    ): MaterialExternalActivityResolveResponse = resolver.resolve(request.url)
}
