package com.playsay.worksheetimport.controller

import com.playsay.contract.worksheetimport.model.MaterializationAcknowledgementRequest
import com.playsay.contract.worksheetimport.model.WorksheetImportCreateRequest
import com.playsay.contract.worksheetimport.model.WorksheetMaterializationRequest
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetImportSession
import com.playsay.worksheetimport.domain.WorksheetReview
import com.playsay.worksheetimport.domain.WorksheetUploadRejection
import com.playsay.worksheetimport.service.WorksheetImportSessionService
import com.playsay.worksheetimport.service.WorksheetMaterializationBundleService
import com.playsay.worksheetimport.service.WorksheetPacketIntake
import com.playsay.worksheetimport.service.WorksheetPacketNormalizer
import com.playsay.worksheetimport.service.WorksheetPagePreviewService
import com.playsay.worksheetimport.service.WorksheetSessionCleanupService
import com.playsay.worksheetimport.service.WorksheetSessionCreateCommand
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

class WorksheetImportDisabledException : RuntimeException()
class WorksheetPacketEmptyException : RuntimeException()

@RestController
class WorksheetImportInternalController(
    private val properties: WorksheetImportProperties,
    private val intake: WorksheetPacketIntake,
    private val normalizer: WorksheetPacketNormalizer,
    private val sessions: WorksheetImportSessionService,
    private val previews: WorksheetPagePreviewService,
    private val cleanup: WorksheetSessionCleanupService,
    private val materialization: WorksheetMaterializationBundleService,
) {
    @PostMapping("/internal/worksheet-imports", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE], produces = [MediaType.APPLICATION_JSON_VALUE])
    fun create(
        authentication: JwtAuthenticationToken,
        @RequestPart("metadata") metadata: WorksheetImportCreateRequest,
        @RequestPart("files") files: List<MultipartFile>,
    ): ResponseEntity<Map<String, Any>> {
        if (!properties.enabled) throw WorksheetImportDisabledException()
        val sessionId = UUID.randomUUID()
        intake.inspect(files).use { inspected ->
            if (inspected.accepted.isEmpty()) throw WorksheetPacketEmptyException()
            normalizer.normalize(sessionId, inspected.accepted).use { packet ->
                if (packet.pages.isEmpty()) throw WorksheetPacketEmptyException()
                val session = sessions.create(
                    WorksheetSessionCreateCommand(
                        authentication.token.subject, metadata.title, metadata.language, metadata.cefrLevel.value, metadata.sourceNote,
                    ),
                    packet,
                )
                return ResponseEntity.status(HttpStatus.CREATED).body(
                    mapOf("session" to session.response(), "rejectedSources" to (inspected.rejected + packet.rejected).map { it.response() }),
                )
            }
        }
    }

    @GetMapping("/internal/worksheet-imports/{sessionId}")
    fun get(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID) = sessions.getAuthorized(sessionId, authentication).response()

    @DeleteMapping("/internal/worksheet-imports/{sessionId}")
    fun cancel(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID): ResponseEntity<Void> {
        cleanup.cancelAuthorized(sessionId, authentication)
        return ResponseEntity.noContent().build()
    }

    @GetMapping("/internal/worksheet-imports/{sessionId}/pages/{pageId}/preview")
    fun preview(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID, @PathVariable pageId: UUID): ResponseEntity<ByteArray> {
        val session = sessions.getAuthorized(sessionId, authentication)
        val page = session.pages.singleOrNull { it.id == pageId } ?: throw com.playsay.worksheetimport.service.WorksheetSessionNotFoundException()
        val content = previews.readAuthorized(page)
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(content.contentType)).body(content.bytes)
    }

    @PutMapping("/internal/worksheet-imports/{sessionId}/review")
    fun review(
        authentication: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
        @RequestHeader("If-Match") revision: Long,
        @RequestBody review: WorksheetReview,
    ): Map<String, Any?> {
        sessions.getAuthorized(sessionId, authentication)
        return sessions.replaceReview(sessionId, revision, review).response()
    }

    @PostMapping("/internal/worksheet-imports/{sessionId}/continue-manually")
    fun continueManually(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID): Map<String, Any?> {
        sessions.getAuthorized(sessionId, authentication)
        return sessions.continueManually(sessionId).response()
    }

    @PostMapping("/internal/worksheet-imports/{sessionId}/retry")
    fun retryAnalysis(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID): Map<String, Any?> {
        sessions.getAuthorized(sessionId, authentication)
        return sessions.retryAnalysis(sessionId).response()
    }

    @PostMapping("/internal/worksheet-imports/{sessionId}/materialization-bundle")
    fun bundle(
        authentication: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
        @RequestBody request: WorksheetMaterializationRequest,
    ): com.playsay.worksheetimport.domain.WorksheetMaterializationBundle {
        sessions.getAuthorized(sessionId, authentication)
        return materialization.bundle(sessionId, request.expectedRevision, request.rightsConfirmed)
    }

    @GetMapping("/internal/worksheet-imports/{sessionId}/materialization-assets/{assetId}")
    fun materializationAsset(
        authentication: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
        @PathVariable assetId: UUID,
    ): ResponseEntity<ByteArray> {
        val session = sessions.getAuthorized(sessionId, authentication)
        val content = materialization.asset(sessionId, session.revision, assetId)
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(content.contentType)).body(content.bytes)
    }

    @PostMapping("/internal/worksheet-imports/{sessionId}/materialization-acknowledgement")
    fun acknowledge(
        authentication: JwtAuthenticationToken,
        @PathVariable sessionId: UUID,
        @RequestBody request: MaterializationAcknowledgementRequest,
    ): Map<String, Any?> {
        sessions.getAuthorized(sessionId, authentication)
        materialization.acknowledge(sessionId, request.revision, request.materialId)
        return sessions.getAuthorized(sessionId, authentication).response()
    }

    private fun WorksheetImportSession.response(): Map<String, Any?> = mapOf(
        "id" to id, "status" to status, "revision" to revision, "title" to title, "language" to language, "cefrLevel" to cefrLevel,
        "sources" to sources.map { source -> mapOf(
            "id" to source.id, "order" to source.order, "kind" to source.kind, "fileName" to source.fileName,
            "mimeType" to source.mimeType, "byteSize" to source.byteSize, "checksumSha256" to source.checksumSha256,
            "pageCount" to pages.count { page -> page.sourceId == source.id },
        ) },
        "pages" to pages.map { page -> mapOf(
            "id" to page.id, "sourceId" to page.sourceId, "sourcePageNumber" to page.sourcePageNumber, "order" to page.order,
            "width" to page.width, "height" to page.height, "previewUrl" to "/internal/worksheet-imports/$id/pages/${page.id}/preview",
            "snapCandidates" to ocrSnapCandidates(page.id),
        ) },
        "review" to review, "blockers" to blockers, "failureClass" to failureClass, "materialId" to materialId,
        "createdAt" to createdAt, "updatedAt" to updatedAt, "expiresAt" to expiresAt,
    )

    private fun WorksheetImportSession.ocrSnapCandidates(pageId: UUID): List<Map<String, Any>> =
        analysis?.path("pages")?.takeIf { it.isArray }?.firstOrNull { it.path("pageId").asText() == pageId.toString() }
            ?.path("words")?.takeIf { it.isArray }?.mapNotNull { word ->
                val text = word.path("text").asText().trim()
                val region = word.path("region")
                val id = word.path("id").asText().trim()
                if (id.isBlank() || text.isBlank() || !region.isObject) return@mapNotNull null
                mapOf(
                    "id" to id,
                    "text" to text,
                    "confidence" to word.path("confidence").asDouble(0.0).coerceIn(0.0, 1.0),
                    "region" to mapOf(
                        "x" to region.path("x").asInt(), "y" to region.path("y").asInt(),
                        "width" to region.path("width").asInt(), "height" to region.path("height").asInt(),
                        "anchor" to "OCR_WORD", "anchorId" to id,
                    ),
                )
            }.orEmpty()

    private fun WorksheetUploadRejection.response() = mapOf("fileName" to fileName, "code" to code)
}

@org.springframework.web.bind.annotation.RestControllerAdvice
class WorksheetImportExceptionHandler {
    @ExceptionHandler(WorksheetImportDisabledException::class)
    fun disabled() = ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(mapOf("code" to "WORKSHEET_IMPORT_DISABLED"))

    @ExceptionHandler(WorksheetPacketEmptyException::class)
    fun empty() = ResponseEntity.badRequest().body(mapOf("code" to "WORKSHEET_PACKET_EMPTY"))

    @ExceptionHandler(com.playsay.worksheetimport.service.WorksheetSessionNotFoundException::class, com.playsay.worksheetimport.service.WorksheetStagingNotFoundException::class)
    fun notFound() = ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("code" to "WORKSHEET_IMPORT_NOT_FOUND"))

    @ExceptionHandler(com.playsay.worksheetimport.service.WorksheetRevisionConflictException::class)
    fun conflict(error: com.playsay.worksheetimport.service.WorksheetRevisionConflictException) =
        ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("currentRevision" to error.currentRevision, "currentStatus" to error.currentStatus))

    @ExceptionHandler(com.playsay.worksheetimport.service.WorksheetSessionStateException::class, com.playsay.worksheetimport.service.WorksheetMaterializationConflictException::class)
    fun state() = ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("code" to "WORKSHEET_IMPORT_STATE_CONFLICT"))

    @ExceptionHandler(com.playsay.worksheetimport.service.WorksheetMaterializationBlockedException::class)
    fun blocked() = ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(mapOf("code" to "WORKSHEET_IMPORT_BLOCKED"))
}
