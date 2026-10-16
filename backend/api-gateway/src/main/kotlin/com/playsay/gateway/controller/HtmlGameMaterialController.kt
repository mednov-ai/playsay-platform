package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialGameAttachRequest
import com.playsay.gateway.service.LessonMaterialCatalogService
import com.playsay.gateway.service.game.MaterialGameReferenceService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.MediaType
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
class HtmlGameMaterialController(
    private val references: MaterialGameReferenceService,
    private val materials: LessonMaterialCatalogService,
) {
    @PostMapping("/materials/{materialId}/games")
    @Operation(operationId = "attachHtmlGameToMaterial", summary = "Attach a pinned game occurrence idempotently to an editable material")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun attach(auth: JwtAuthenticationToken, @PathVariable materialId: UUID, @RequestBody request: MaterialGameAttachRequest): LessonMaterialResponse = references.attach(auth, materialId, request, materials)
    @PostMapping("/games/{gameId}/materials")
    @Operation(operationId = "createMaterialFromHtmlGame", summary = "Create a new material with a pinned game, idempotently")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun createMaterial(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @RequestBody request: com.playsay.gateway.dto.HtmlGameMaterialRequest): LessonMaterialResponse = references.createMaterial(auth, gameId, request, materials)

}
