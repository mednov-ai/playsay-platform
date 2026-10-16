package com.playsay.gateway.controller

import com.playsay.gateway.dto.CollaborationDocumentResponse
import com.playsay.gateway.dto.LessonGameLaunchResponse
import com.playsay.gateway.dto.LessonGameStartRequest
import com.playsay.gateway.service.game.HtmlGameContentService
import com.playsay.gateway.service.game.LessonGameService
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
@Tag(name = "Lesson Games")
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
class LessonGameController(private val games: LessonGameService, private val content: HtmlGameContentService) {
    @GetMapping("/schedule/lessons/{lessonId}/game-launches/current")
    @Operation(operationId = "getCurrentLessonGame", summary = "Recover the active library game without a material assignment")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun current(auth: JwtAuthenticationToken, @PathVariable lessonId: UUID): com.playsay.gateway.dto.LessonGameStateResponse = games.current(auth, lessonId)

    @PostMapping("/schedule/lessons/{lessonId}/game-launches")
    @Operation(operationId = "startLessonLibraryGame", summary = "Start a pinned shared library game without changing the material")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun start(auth: JwtAuthenticationToken, @PathVariable lessonId: UUID, @RequestBody request: LessonGameStartRequest): LessonGameLaunchResponse = games.start(auth, lessonId, request)

    @PostMapping("/schedule/lessons/{lessonId}/game-launches/{launchId}/stop")
    @Operation(operationId = "stopLessonLibraryGame", summary = "Stop only the specified shared launch")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun stop(auth: JwtAuthenticationToken, @PathVariable lessonId: UUID, @PathVariable launchId: UUID): LessonGameLaunchResponse = games.stop(auth, lessonId, launchId)

    @GetMapping("/schedule/lessons/{lessonId}/game-launches/{launchId}/document")
    @Operation(operationId = "getLessonGameDocument", summary = "Get the exact authorized lesson game collaboration binding")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun document(auth: JwtAuthenticationToken, @PathVariable lessonId: UUID, @PathVariable launchId: UUID): CollaborationDocumentResponse = games.document(auth, lessonId, launchId)

    @GetMapping("/schedule/lessons/{lessonId}/game-launches/{launchId}/content", produces = [MediaType.TEXT_HTML_VALUE])
    @Operation(operationId = "getLessonGameContent", summary = "Read pinned game content under current lesson admission and launch permissions")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun content(auth: JwtAuthenticationToken, @PathVariable lessonId: UUID, @PathVariable launchId: UUID): ResponseEntity<ByteArray> = content.forLaunch(auth, lessonId, launchId)
}
