package com.playsay.gateway.controller

import com.playsay.gateway.dto.MaterialAssetResponse
import com.playsay.gateway.dto.MaterialAssetUpdateRequest
import com.playsay.gateway.service.LessonMaterialStore
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Materials")
class MaterialAssetController(
    private val store: LessonMaterialStore,
) {
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
