package com.playsay.gateway.controller

import com.playsay.gateway.dto.CollaborationDocumentResponse
import com.playsay.gateway.dto.CollaborationTokenResponse
import com.playsay.gateway.dto.CreateCollaborationDocumentRequest
import com.playsay.gateway.dto.FinalizeCollaborationDocumentRequest
import com.playsay.gateway.dto.MaterialSubmissionResponse
import com.playsay.gateway.dto.SaveCollaborationSnapshotRequest
import com.playsay.gateway.service.CollaborationDocumentService
import com.playsay.gateway.service.CollaborationSnapshotService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Collaboration")
class CollaborationDocumentController(
    private val service: CollaborationDocumentService,
    private val snapshotService: CollaborationSnapshotService,
) {
    @GetMapping(
        "/schedule/lessons/{lessonId}/collaboration-documents/current",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "getCurrentCollaborationDocument",
        summary = "Get current collaboration document",
        description = "Returns the current user's individual document or the shared group document for a scheduled lesson material.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Collaboration document"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot access the document", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Collaboration document not found", content = [Content()]),
        ],
    )
    fun current(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestParam materialId: UUID,
        @RequestParam documentKind: String = "MATERIAL_WORK",
        @RequestParam scope: String = "INDIVIDUAL",
    ): CollaborationDocumentResponse =
        service.current(authentication, lessonId, materialId, documentKind, scope)

    @PostMapping(
        "/schedule/lessons/{lessonId}/collaboration-documents/current",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createCurrentCollaborationDocument",
        summary = "Create or get current collaboration document",
        description = "Creates the current user's individual document or the shared group document if missing, then returns it.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Collaboration document"),
            ApiResponse(responseCode = "400", description = "Invalid collaboration scope or payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot access the document", content = [Content()]),
        ],
    )
    fun createCurrent(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestBody request: CreateCollaborationDocumentRequest,
    ): CollaborationDocumentResponse =
        service.createCurrent(authentication, lessonId, request)

    @GetMapping(
        "/schedule/lessons/{lessonId}/collaboration-documents",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "listCollaborationDocuments",
        summary = "List collaboration documents",
        description = "Students see their own individual document and the group document; teachers and admins see all documents for the lesson material.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Collaboration documents"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot access the lesson material", content = [Content()]),
        ],
    )
    fun list(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestParam materialId: UUID,
    ): List<CollaborationDocumentResponse> =
        service.list(authentication, lessonId, materialId)

    @PutMapping(
        "/schedule/lessons/{lessonId}/collaboration-documents/{documentId}/snapshot",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "saveCollaborationDocumentSnapshot",
        summary = "Save collaboration document snapshot",
        description = "Stores the latest normalized snapshot for a collaboration document and increments its version.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Snapshot saved"),
            ApiResponse(responseCode = "400", description = "Invalid snapshot", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot modify the document", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Collaboration document not found", content = [Content()]),
        ],
    )
    fun saveSnapshot(
        authentication: JwtAuthenticationToken?,
        @PathVariable lessonId: UUID,
        @PathVariable documentId: UUID,
        @RequestBody request: SaveCollaborationSnapshotRequest,
        @Parameter(hidden = true)
        @RequestHeader("X-PlaySay-Collaboration-Service-Token", required = false) serviceToken: String? = null,
    ): CollaborationDocumentResponse =
        if (authentication != null) {
            snapshotService.saveSnapshot(authentication, lessonId, documentId, request)
        } else {
            snapshotService.saveSnapshotFromService(serviceToken, lessonId, documentId, request)
        }

    @GetMapping(
        "/schedule/lessons/{lessonId}/collaboration-documents/{documentId}/snapshot",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "getCollaborationDocumentSnapshotForService",
        summary = "Load collaboration document snapshot",
        description = "Internal snapshot restore endpoint for the collaboration service.",
        hidden = true,
    )
    fun getSnapshotForService(
        @PathVariable lessonId: UUID,
        @PathVariable documentId: UUID,
        @Parameter(hidden = true)
        @RequestHeader("X-PlaySay-Collaboration-Service-Token", required = false) serviceToken: String? = null,
    ): CollaborationDocumentResponse =
        snapshotService.getSnapshotFromService(serviceToken, lessonId, documentId)

    @PostMapping(
        "/schedule/lessons/{lessonId}/collaboration-documents/{documentId}/finalize",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "finalizeCollaborationDocument",
        summary = "Finalize collaboration document",
        description = "Creates or updates the normal material submission from the latest collaboration snapshot.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material submission"),
            ApiResponse(responseCode = "400", description = "Invalid document scope or missing snapshot", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot finalize the document", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Collaboration document not found", content = [Content()]),
        ],
    )
    fun finalize(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable documentId: UUID,
        @RequestBody request: FinalizeCollaborationDocumentRequest,
    ): MaterialSubmissionResponse =
        snapshotService.finalize(authentication, lessonId, documentId, request)

    @PostMapping(
        "/schedule/lessons/{lessonId}/collaboration-documents/{documentId}/token",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createCollaborationDocumentToken",
        summary = "Create collaboration websocket token",
        description = "Returns a short-lived token scoped to the collaboration document room.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Collaboration token"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot join the document", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Collaboration document not found", content = [Content()]),
            ApiResponse(responseCode = "503", description = "Collaboration token signing is not configured", content = [Content()]),
        ],
    )
    fun token(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable documentId: UUID,
        @RequestHeader(name = HttpHeaders.ORIGIN, required = false) origin: String? = null,
    ): CollaborationTokenResponse =
        service.token(authentication, lessonId, documentId, origin)
}
