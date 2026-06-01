package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonMaterialDraftResponse
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialAiDraftRequest
import com.playsay.gateway.dto.MaterialAnswerSuggestionsRequest
import com.playsay.gateway.dto.MaterialAnswerSuggestionsResponse
import com.playsay.gateway.dto.MaterialGenerateImagesRequest
import com.playsay.gateway.dto.MaterialUrlImportRequest
import com.playsay.gateway.service.LessonMaterialStore
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Materials")
class MaterialAiController(
    private val store: LessonMaterialStore,
) {
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

    @PostMapping(
        "/materials/{materialId}/answer-suggestions",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "suggestMaterialAcceptedAnswers",
        summary = "Suggest accepted answer variants",
        description = "Suggests additional correct answer variants for selected objective material items. Requires material owner or ADMIN role; suggestions are not saved until the teacher accepts them.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Suggested accepted answer variants"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot edit material", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material or block not found", content = [Content()]),
        ],
    )
    fun suggestAcceptedAnswers(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @RequestBody request: MaterialAnswerSuggestionsRequest,
    ): MaterialAnswerSuggestionsResponse =
        store.suggestAcceptedAnswers(authentication, materialId, request)
}
