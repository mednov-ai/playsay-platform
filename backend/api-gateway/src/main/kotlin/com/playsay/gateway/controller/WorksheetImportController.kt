package com.playsay.gateway.controller

import com.fasterxml.jackson.databind.JsonNode
import com.playsay.gateway.dto.WorksheetImportCreateRequest
import com.playsay.gateway.dto.WorksheetMaterializeRequest
import com.playsay.gateway.dto.WorksheetMaterializeResponse
import com.playsay.gateway.service.WorksheetMaterializationService
import com.playsay.gateway.service.WorksheetImportFacadeService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import jakarta.validation.Valid
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.multipart.MultipartFile

@RestController
class WorksheetImportController(
    private val facade: WorksheetImportFacadeService,
    private val materialization: WorksheetMaterializationService,
) {
    @PostMapping("/worksheet-imports", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE], produces = [MediaType.APPLICATION_JSON_VALUE])
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    @Operation(operationId = "createWorksheetImport", summary = "Create a worksheet import from photos, scans or PDFs", security = [SecurityRequirement(name = "bearerAuth")])
    fun create(authentication: JwtAuthenticationToken, @Valid @RequestPart metadata: WorksheetImportCreateRequest, @RequestPart files: List<MultipartFile>): JsonNode =
        facade.create(authentication, metadata, files)

    @GetMapping("/worksheet-imports/{sessionId}")
    @Operation(operationId = "getWorksheetImport")
    fun get(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID): JsonNode = facade.get(authentication, sessionId)

    @DeleteMapping("/worksheet-imports/{sessionId}")
    @Operation(operationId = "cancelWorksheetImport")
    fun cancel(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID): ResponseEntity<Void> {
        facade.cancel(authentication, sessionId); return ResponseEntity.noContent().build()
    }

    @GetMapping("/worksheet-imports/{sessionId}/pages/{pageId}/preview")
    @Operation(operationId = "getWorksheetImportPagePreview")
    fun preview(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID, @PathVariable pageId: UUID): ResponseEntity<ByteArray> {
        val content = facade.preview(authentication, sessionId, pageId)
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(content.contentType)).body(content.bytes)
    }

    @PutMapping("/worksheet-imports/{sessionId}/review")
    @Operation(operationId = "replaceWorksheetImportReview")
    fun review(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID, @RequestHeader("If-Match") revision: Long, @RequestBody body: JsonNode): JsonNode =
        facade.replaceReview(authentication, sessionId, revision, body)

    @PostMapping("/worksheet-imports/{sessionId}/continue-manually")
    @Operation(operationId = "continueWorksheetImportManually")
    fun continueManually(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID): JsonNode =
        facade.continueManually(authentication, sessionId)

    @PostMapping("/worksheet-imports/{sessionId}/retry")
    @Operation(operationId = "retryWorksheetImportAnalysis")
    fun retryAnalysis(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID): JsonNode =
        facade.retryAnalysis(authentication, sessionId)

    @PostMapping("/worksheet-imports/{sessionId}/materialize", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "materializeWorksheetImport")
    fun materialize(
        authentication: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
        @RequestBody request: WorksheetMaterializeRequest,
    ) = WorksheetMaterializeResponse(materialization.materialize(authentication, sessionId, request.expectedRevision, request.rightsConfirmed))
}
