package com.playsay.gateway.controller

import com.playsay.gateway.dto.RegionalRouteDiagnosticEventRequest
import com.playsay.gateway.service.RegionalRouteDiagnosticService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Diagnostics")
class RegionalRouteDiagnosticController(
    private val diagnostics: RegionalRouteDiagnosticService,
) {
    @PostMapping("/diagnostics/regional-route")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
        operationId = "recordRegionalRouteDiagnostic",
        summary = "Record a privacy-safe regional route diagnostic event",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponse(responseCode = "204", description = "Diagnostic event recorded")
    fun record(
        authentication: JwtAuthenticationToken,
        @RequestBody event: RegionalRouteDiagnosticEventRequest,
    ) {
        diagnostics.record(authentication.name, event)
    }
}
