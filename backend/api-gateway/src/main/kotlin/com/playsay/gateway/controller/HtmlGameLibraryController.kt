package com.playsay.gateway.controller

import com.playsay.gateway.dto.HtmlGameEditRequest
import com.playsay.gateway.dto.HtmlGameForkRequest
import com.playsay.gateway.dto.HtmlGamePageResponse
import com.playsay.gateway.dto.HtmlGameResponse
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialGameAttachRequest
import com.playsay.gateway.service.LessonMaterialCatalogService
import com.playsay.gateway.service.game.HtmlGameContentService
import com.playsay.gateway.service.game.HtmlGameLibraryService
import com.playsay.gateway.service.game.MaterialGameReferenceService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile

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
class HtmlGameLibraryController(
    private val games: HtmlGameLibraryService,
    private val content: HtmlGameContentService,
    private val references: MaterialGameReferenceService,
    private val materials: LessonMaterialCatalogService,
    private val processing: com.playsay.gateway.service.game.HtmlGameProcessingService,
) {
    @GetMapping("/games")
    @Operation(operationId = "listHtmlGames", summary = "Search the shared teacher HTML game catalog")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun list(auth: JwtAuthenticationToken, @RequestParam(defaultValue = "") search: String, @RequestParam(defaultValue = "") topic: String, @RequestParam(required = false) level: String?, @RequestParam(required = false) compatibility: String?, @RequestParam(defaultValue = "0") page: Int, @RequestParam(defaultValue = "24") pageSize: Int): HtmlGamePageResponse = games.list(auth, search, topic, level, compatibility, page, pageSize)

    @GetMapping("/games/{gameId}")
    @Operation(operationId = "getHtmlGame", summary = "Get game metadata for a teacher")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun get(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @RequestParam(required = false) revisionId: UUID?): HtmlGameResponse = games.get(auth, gameId, revisionId)

    @PostMapping("/games", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @Operation(operationId = "uploadHtmlGame", summary = "Upload a shared game, maximum 20 MiB, with idempotent command identity")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Success")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    fun upload(auth: JwtAuthenticationToken, @RequestPart file: MultipartFile, @RequestHeader("Idempotency-Key") commandId: UUID): ResponseEntity<HtmlGameResponse> = ResponseEntity.status(201).body(games.upload(auth, file, commandId))

    @PostMapping("/games/{gameId}/revisions", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @Operation(operationId = "uploadHtmlGameRevision", summary = "Create a pinned immutable game revision; requires author or administrator")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Success")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    fun revision(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @RequestPart file: MultipartFile, @RequestHeader("Idempotency-Key") commandId: UUID, @RequestParam expectedVersion: Long): ResponseEntity<HtmlGameResponse> = ResponseEntity.status(201).body(games.upload(auth, file, commandId, gameId, expectedVersion))

    @PatchMapping("/games/{gameId}")
    @Operation(operationId = "editHtmlGame", summary = "Edit catalog metadata with optimistic concurrency")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun edit(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @RequestBody request: HtmlGameEditRequest): HtmlGameResponse = games.edit(auth, gameId, request)

    @DeleteMapping("/games/{gameId}")
    @Operation(operationId = "archiveHtmlGame", summary = "Archive a game while retaining existing references")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "Success")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    fun archive(auth: JwtAuthenticationToken, @PathVariable gameId: UUID): ResponseEntity<Void> { games.archive(auth, gameId); return ResponseEntity.noContent().build() }

    @PostMapping("/games/{gameId}/fork")
    @Operation(operationId = "forkHtmlGame", summary = "Create an independently editable derivative without copying immutable bytes")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun fork(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @RequestBody request: HtmlGameForkRequest): HtmlGameResponse = games.fork(auth, gameId, request.revisionId, request.commandId)

    @GetMapping("/games/{gameId}/revisions/{revisionId}/content", produces = [MediaType.TEXT_HTML_VALUE])
    @Operation(operationId = "getHtmlGameContent", summary = "Read private game bytes; learners require an exact authorized material reference")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun content(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @PathVariable revisionId: UUID, @RequestParam(required = false) materialId: UUID?): ResponseEntity<ByteArray> = content.content(auth, gameId, revisionId, materialId)

    @GetMapping("/games/{gameId}/revisions/{revisionId}/cover", produces = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"])
    @Operation(operationId = "getHtmlGameCover", summary = "Read a private cover under the same context permissions")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun cover(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @PathVariable revisionId: UUID, @RequestParam(required = false) materialId: UUID?): ResponseEntity<ByteArray> = content.content(auth, gameId, revisionId, materialId, true)

    @PostMapping("/materials/{materialId}/games")
    @Operation(operationId = "attachHtmlGameToMaterial", summary = "Attach a pinned game occurrence idempotently to an editable material")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun attach(auth: JwtAuthenticationToken, @PathVariable materialId: UUID, @RequestBody request: MaterialGameAttachRequest): LessonMaterialResponse = references.attach(auth, materialId, request, materials)
    @PostMapping("/games/{gameId}/materials")
    @Operation(operationId = "createMaterialFromHtmlGame", summary = "Create a new material with a pinned game, idempotently")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Success")
    fun createMaterial(auth: JwtAuthenticationToken, @PathVariable gameId: UUID, @RequestBody request: com.playsay.gateway.dto.HtmlGameMaterialRequest): LessonMaterialResponse = references.createMaterial(auth, gameId, request, materials)

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
