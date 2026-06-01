package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.service.LessonMaterialStore
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Materials")
class MaterialCrudController(
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
}
