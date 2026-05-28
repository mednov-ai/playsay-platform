package com.playsay.gateway.controller

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.math.BigDecimal
import java.math.RoundingMode
import java.sql.ResultSet
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*

@RestController
@Tag(name = "Materials")
class MaterialController(
    private val store: LessonMaterialStore,
) {
    @GetMapping("/materials", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listMaterials",
        summary = "List lesson materials",
        description = "Teachers/admins see their materials and published public materials. Students see published public materials.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Lesson materials"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
        ],
    )
    fun list(authentication: JwtAuthenticationToken): List<LessonMaterialResponse> =
        store.list(authentication)

    @GetMapping("/materials/{materialId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getMaterial",
        summary = "Get lesson material",
        description = "Returns a visible lesson material.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Lesson material"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
        ],
    )
    fun get(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
    ): LessonMaterialResponse =
        store.get(authentication, materialId)

    @PostMapping(
        "/materials",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createMaterial",
        summary = "Create lesson material",
        description = "Creates a structured lesson material. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Lesson material created"),
            ApiResponse(responseCode = "400", description = "Invalid material payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage materials", content = [Content()]),
        ],
    )
    fun create(
        authentication: JwtAuthenticationToken,
        @RequestBody request: LessonMaterialRequest,
    ): ResponseEntity<LessonMaterialResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(store.create(authentication, request))

    @PutMapping(
        "/materials/{materialId}",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "updateMaterial",
        summary = "Update lesson material",
        description = "Updates a structured lesson material. Requires material owner or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Lesson material updated"),
            ApiResponse(responseCode = "400", description = "Invalid material payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot edit material", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
        ],
    )
    fun update(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @RequestBody request: LessonMaterialRequest,
    ): LessonMaterialResponse =
        store.update(authentication, materialId, request)

    @DeleteMapping("/materials/{materialId}")
    @Operation(
        operationId = "archiveMaterial",
        summary = "Archive lesson material",
        description = "Archives a lesson material. Requires material owner or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "204", description = "Lesson material archived"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot archive material", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
        ],
    )
    fun archive(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
    ): ResponseEntity<Void> {
        store.archive(authentication, materialId)
        return ResponseEntity.noContent().build()
    }

    @GetMapping("/schedule/lessons/{lessonId}/material", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getScheduledLessonMaterial",
        summary = "Get scheduled lesson material",
        description = "Returns the material attached directly to a scheduled lesson or inherited from its lesson template.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Scheduled lesson material"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
        ],
    )
    fun scheduledLessonMaterial(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): LessonMaterialResponse =
        store.getForScheduledLesson(authentication, lessonId)

    @GetMapping("/schedule/lessons/{lessonId}/material-submission", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getScheduledLessonMaterialSubmission",
        summary = "Get current material answer snapshot",
        description = "Returns the current user's saved answers for the material attached to a scheduled lesson.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material submission"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Submission, lesson, or material not found", content = [Content()]),
        ],
    )
    fun scheduledLessonMaterialSubmission(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): MaterialSubmissionResponse =
        store.getSubmissionForScheduledLesson(authentication, lessonId)

    @GetMapping("/schedule/lessons/{lessonId}/material-submissions", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listScheduledLessonMaterialSubmissions",
        summary = "List material answer snapshots for scheduled lesson",
        description = "Returns saved student answers for the material attached to a scheduled lesson. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material submissions"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot monitor submissions", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
        ],
    )
    fun scheduledLessonMaterialSubmissions(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): List<MaterialSubmissionResponse> =
        store.listSubmissionsForScheduledLesson(authentication, lessonId)

    @GetMapping("/schedule/lessons/{lessonId}/material-annotation", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getScheduledLessonMaterialAnnotation",
        summary = "Get shared material annotation layer",
        description = "Returns the shared drawing layer for the material attached to a scheduled lesson.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material annotation"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Annotation, scheduled lesson, or material not found", content = [Content()]),
        ],
    )
    fun scheduledLessonMaterialAnnotation(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): MaterialAnnotationResponse =
        store.getAnnotationForScheduledLesson(authentication, lessonId)

    @PutMapping(
        "/schedule/lessons/{lessonId}/material-annotation",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "saveScheduledLessonMaterialAnnotation",
        summary = "Save shared material annotation layer",
        description = "Creates or updates the shared drawing layer for the material attached to a scheduled lesson.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material annotation saved"),
            ApiResponse(responseCode = "400", description = "Invalid annotation payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
        ],
    )
    fun saveScheduledLessonMaterialAnnotation(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestBody request: MaterialAnnotationRequest,
    ): MaterialAnnotationResponse =
        store.saveAnnotationForScheduledLesson(authentication, lessonId, request)

    @PutMapping(
        "/schedule/lessons/{lessonId}/material-submission",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "saveScheduledLessonMaterialSubmission",
        summary = "Save current material answer snapshot",
        description = "Creates or updates the current user's answers for the material attached to a scheduled lesson.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material submission saved"),
            ApiResponse(responseCode = "400", description = "Invalid submission payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
        ],
    )
    fun saveScheduledLessonMaterialSubmission(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestBody request: MaterialSubmissionRequest,
    ): MaterialSubmissionResponse =
        store.saveSubmissionForScheduledLesson(authentication, lessonId, request)

    @PostMapping(
        "/materials/ai-draft",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "draftMaterialWithAi",
        summary = "Draft lesson material with AI",
        description = "Returns a structured Play&Say material draft from a text prompt and optional worksheet image scan/photo. Uses the configured AI provider, or deterministic stub when AI is disabled.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Draft material"),
            ApiResponse(responseCode = "400", description = "Invalid draft prompt", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage materials", content = [Content()]),
        ],
    )
    fun draft(
        authentication: JwtAuthenticationToken,
        @RequestBody request: MaterialAiDraftRequest,
    ): LessonMaterialDraftResponse =
        store.draft(authentication, request)

    @PostMapping(
        "/materials/import-url",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "draftMaterialFromUrl",
        summary = "Draft lesson material from external URL",
        description = "Fetches readable text from an http/https page, then returns a structured Play&Say draft through the configured AI provider. Local/private hosts are rejected.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Draft material"),
            ApiResponse(responseCode = "400", description = "Invalid or unreadable external URL", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage materials", content = [Content()]),
            ApiResponse(responseCode = "502", description = "External URL or AI provider failed", content = [Content()]),
        ],
    )
    fun draftFromUrl(
        authentication: JwtAuthenticationToken,
        @RequestBody request: MaterialUrlImportRequest,
    ): LessonMaterialDraftResponse =
        store.draftFromUrl(authentication, request)

    @PostMapping(
        "/materials/{materialId}/generate-images",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "generateMaterialImages",
        summary = "Generate material images",
        description = "Generates missing or regenerated AI illustrations for generated-image and matching-pairs material blocks, stores bytes in object storage, and updates the material document. Requires material owner or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Lesson material with generated images"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot edit material", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
        ],
    )
    fun generateImages(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @RequestBody request: MaterialGenerateImagesRequest,
    ): LessonMaterialResponse =
        store.generateImages(authentication, materialId, request)

    @GetMapping("/materials/{materialId}/assets", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listMaterialAssets",
        summary = "List material assets",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun listAssets(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
    ): List<MaterialAssetResponse> =
        store.listAssets(authentication, materialId)

    @GetMapping("/materials/{materialId}/assets/{assetId}/content")
    @Operation(
        operationId = "getMaterialAssetContent",
        summary = "Get material asset content",
        description = "Streams material asset bytes through the backend from the configured S3-compatible object storage.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material asset content"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material asset not found", content = [Content()]),
            ApiResponse(responseCode = "502", description = "Object storage failed", content = [Content()]),
        ],
    )
    fun assetContent(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @PathVariable assetId: UUID,
    ): ResponseEntity<ByteArray> =
        store.assetContent(authentication, materialId, assetId)

    @PatchMapping(
        "/materials/{materialId}/assets/{assetId}",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "updateMaterialAsset",
        summary = "Update material asset metadata",
        description = "Updates editable metadata for a material asset, currently tags. Requires material owner or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Updated material asset"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot edit material", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material or asset not found", content = [Content()]),
        ],
    )
    fun updateAsset(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @PathVariable assetId: UUID,
        @RequestBody request: MaterialAssetUpdateRequest,
    ): MaterialAssetResponse =
        store.updateAsset(authentication, materialId, assetId, request)
}
