package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialAnnotationRequest
import com.playsay.gateway.dto.MaterialAnnotationResponse
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.MaterialSubmissionResponse
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
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Materials")
class ScheduledMaterialController(
    private val store: LessonMaterialStore,
) {
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
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
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
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
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
}
