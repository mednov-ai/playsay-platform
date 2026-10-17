package com.playsay.gateway.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
@Tag(name = "HTML Game Library")
@SecurityRequirement(name = "bearerAuth")
@io.swagger.v3.oas.annotations.responses.ApiResponses(value = [
    io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Invalid game query, reference, file or command", content = [io.swagger.v3.oas.annotations.media.Content(mediaType = "application/json", schema = io.swagger.v3.oas.annotations.media.Schema(implementation = com.playsay.gateway.error.ProjectErrorResponse::class))]),
    io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Bearer authentication required", content = [io.swagger.v3.oas.annotations.media.Content(mediaType = "application/json", schema = io.swagger.v3.oas.annotations.media.Schema(implementation = com.playsay.gateway.error.ProjectErrorResponse::class))]),
    io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Teacher, author, manager or admission permission required", content = [io.swagger.v3.oas.annotations.media.Content(mediaType = "application/json", schema = io.swagger.v3.oas.annotations.media.Schema(implementation = com.playsay.gateway.error.ProjectErrorResponse::class))]),
    io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Game/revision/context unavailable; context substitution does not disclose content", content = [io.swagger.v3.oas.annotations.media.Content(mediaType = "application/json", schema = io.swagger.v3.oas.annotations.media.Schema(implementation = com.playsay.gateway.error.ProjectErrorResponse::class))]),
    io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "Command payload, optimistic version, archived game, adaptation trust, active launch or client capability conflict; ProjectErrorResponse.errorCode identifies the reason", content = [io.swagger.v3.oas.annotations.media.Content(mediaType = "application/json", schema = io.swagger.v3.oas.annotations.media.Schema(implementation = com.playsay.gateway.error.ProjectErrorResponse::class))]),
    io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "413", description = "HTML file exceeds 20 MiB", content = [io.swagger.v3.oas.annotations.media.Content(mediaType = "application/json", schema = io.swagger.v3.oas.annotations.media.Schema(implementation = com.playsay.gateway.error.ProjectErrorResponse::class))]),
    io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "422", description = "Embedded image validation failed", content = [io.swagger.v3.oas.annotations.media.Content(mediaType = "application/json", schema = io.swagger.v3.oas.annotations.media.Schema(implementation = com.playsay.gateway.error.ProjectErrorResponse::class))]),
    io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "Game writes paused, maintenance or private storage temporarily unavailable", content = [io.swagger.v3.oas.annotations.media.Content(mediaType = "application/json", schema = io.swagger.v3.oas.annotations.media.Schema(implementation = com.playsay.gateway.error.ProjectErrorResponse::class))])
])
class HtmlGameProcessingController(
    private val processing: com.playsay.gateway.service.game.HtmlGameProcessingService,
) {
    @PostMapping("/games/{gameId}/processing")
    @Operation(operationId = "requestHtmlGameProcessing", summary = "Queue revision-bound enrichment or adaptation with idempotent command identity")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun process(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @RequestBody request: com.playsay.gateway.dto.HtmlGameProcessingRequest) = processing.request(auth, gameId, request)

    @GetMapping("/games/{gameId}/processing/{jobId}")
    @Operation(operationId = "getHtmlGameProcessing", summary = "Get game processing status without exposing private context")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun processingStatus(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @PathVariable jobId: UUID) = processing.status(auth, gameId, jobId)

    @GetMapping("/games/{gameId}/processing/{jobId}/preview", produces = [MediaType.TEXT_HTML_VALUE])
    @Operation(operationId = "previewHtmlGameCandidate", summary = "Local teacher preview of a validated candidate, without launch authority")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun candidate(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @PathVariable jobId: UUID): ResponseEntity<ByteArray> = ResponseEntity.ok().contentType(MediaType.TEXT_HTML).header("Cache-Control", "no-store").header("Content-Security-Policy", "sandbox; default-src 'none'").header("X-Content-Type-Options", "nosniff").body(processing.preview(auth, gameId, jobId))

    @PostMapping("/games/{gameId}/processing/{jobId}/apply")
    @Operation(operationId = "applyHtmlGameCandidate", summary = "Accept a validated candidate as a new immutable revision, checking current version")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun applyCandidate(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @PathVariable jobId: UUID, @RequestParam expectedVersion: Long) = processing.apply(auth, gameId, jobId, expectedVersion)

    @PostMapping("/games/{gameId}/select-revision")
    @Operation(operationId = "selectHtmlGameRevision", summary = "Explicitly select an existing playable revision without changing pinned references")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun selectRevision(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @RequestBody request: com.playsay.gateway.dto.HtmlGameRevisionSelection) = processing.selectRevision(auth, gameId, request)

}
