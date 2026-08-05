package com.playsay.gateway.controller

import com.playsay.gateway.dto.MaterialGameAdaptationRequest
import com.playsay.gateway.dto.MaterialGameAdaptationResponse
import com.playsay.gateway.service.LessonMaterialStore
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Materials")
class MaterialGameAdaptationController(
    private val store: LessonMaterialStore,
) {
    @PostMapping(
        "/materials/{materialId}/assets/{assetId}/game-adaptations",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "requestMaterialGameAdaptation",
        summary = "Adapt an HTML game to Play&Say Game Sync",
        security = [SecurityRequirement(name = "bearerAuth")],
        responses = [
            ApiResponse(
                responseCode = "202",
                description = "Adaptation queued",
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = Schema(implementation = MaterialGameAdaptationResponse::class),
                    ),
                ],
            ),
        ],
    )
    fun requestGameAdaptation(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @PathVariable assetId: UUID,
        @RequestBody request: MaterialGameAdaptationRequest,
    ): ResponseEntity<MaterialGameAdaptationResponse> =
        ResponseEntity.accepted().body(store.requestGameAdaptation(authentication, materialId, assetId, request))

    @GetMapping(
        "/materials/{materialId}/assets/{assetId}/game-adaptations/{jobId}",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "getMaterialGameAdaptation",
        summary = "Get HTML game adaptation status",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun gameAdaptationStatus(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @PathVariable assetId: UUID,
        @PathVariable jobId: UUID,
    ): MaterialGameAdaptationResponse =
        store.gameAdaptationStatus(authentication, materialId, assetId, jobId)

    @PostMapping(
        "/materials/{materialId}/assets/{assetId}/game-adaptations/{jobId}/apply",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "applyMaterialGameAdaptation",
        summary = "Apply a reviewed HTML game adaptation",
        security = [SecurityRequirement(name = "bearerAuth")],
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Applied",
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = Schema(implementation = MaterialGameAdaptationResponse::class),
                    ),
                ],
            ),
            ApiResponse(
                responseCode = "409",
                description = "Material source changed or adaptation is not ready",
                content = [Content()],
            ),
        ],
    )
    fun applyGameAdaptation(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @PathVariable assetId: UUID,
        @PathVariable jobId: UUID,
    ): MaterialGameAdaptationResponse =
        store.applyGameAdaptation(authentication, materialId, assetId, jobId)

    @PostMapping(
        "/materials/{materialId}/assets/{assetId}/game-adaptations/{jobId}/revalidate",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "revalidateMaterialGameAdaptation",
        summary = "Revalidate an HTML game adaptation against its original mechanics",
        security = [SecurityRequirement(name = "bearerAuth")],
        responses = [
            ApiResponse(
                responseCode = "202",
                description = "Revalidation queued",
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = Schema(implementation = MaterialGameAdaptationResponse::class),
                    ),
                ],
            ),
        ],
    )
    fun revalidateGameAdaptation(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @PathVariable assetId: UUID,
        @PathVariable jobId: UUID,
    ): ResponseEntity<MaterialGameAdaptationResponse> =
        ResponseEntity.accepted().body(
            store.revalidateGameAdaptation(authentication, materialId, assetId, jobId),
        )

    @PostMapping(
        "/materials/{materialId}/assets/{assetId}/game-adaptations/{jobId}/rollback",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "rollbackMaterialGameAdaptation",
        summary = "Restore the original HTML game asset",
        security = [SecurityRequirement(name = "bearerAuth")],
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Original restored",
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = Schema(implementation = MaterialGameAdaptationResponse::class),
                    ),
                ],
            ),
            ApiResponse(
                responseCode = "409",
                description = "Material source changed",
                content = [Content()],
            ),
        ],
    )
    fun rollbackGameAdaptation(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @PathVariable assetId: UUID,
        @PathVariable jobId: UUID,
    ): MaterialGameAdaptationResponse =
        store.rollbackGameAdaptation(authentication, materialId, assetId, jobId)
}
