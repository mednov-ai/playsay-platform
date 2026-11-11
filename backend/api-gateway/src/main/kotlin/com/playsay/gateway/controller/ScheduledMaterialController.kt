package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialAnnotationRequest
import com.playsay.gateway.dto.MaterialAnnotationResponse
import com.playsay.gateway.dto.UnallocatedAnnotationSnapshotPage
import com.playsay.gateway.dto.UnallocatedAnnotationMaterialPage
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.MaterialSubmissionResponse
import com.playsay.gateway.service.LessonMaterialStore
import com.playsay.gateway.service.ScheduledMaterialAnnotationService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Materials")
class ScheduledMaterialController(
    private val store: LessonMaterialStore,
    private val annotations: ScheduledMaterialAnnotationService,
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

    @GetMapping("/schedule/lessons/{lessonId}/unallocated-annotation-materials", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "listUnallocatedAnnotationMaterials", summary = "List materials with unallocated annotations for the authorized teacher",
        description = "Includes historical materials after their lesson assignments are removed. Responses are private and not cacheable.",
        security = [SecurityRequirement(name = "bearerAuth")])
    @ApiResponses(value = [
        ApiResponse(responseCode = "200", description = "A page of material identifiers"),
        ApiResponse(responseCode = "400", description = "Invalid page", content = [Content()]),
        ApiResponse(responseCode = "403", description = "Teacher access denied", content = [Content()]),
        ApiResponse(responseCode = "404", description = "Parallel lesson not found", content = [Content()]),
    ])
    fun unallocatedAnnotationMaterials(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @Parameter(schema = Schema(type = "integer", format = "int32", minimum = "0", maximum = "100000", defaultValue = "0"))
        @RequestParam(defaultValue = "0") page: Int,
    ): ResponseEntity<UnallocatedAnnotationMaterialPage> = ResponseEntity.ok()
        .cacheControl(CacheControl.noStore().cachePrivate())
        .body(annotations.getUnallocatedMaterials(authentication, lessonId, page))

    @GetMapping("/schedule/lessons/{lessonId}/materials/{materialId}/unallocated-annotations", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getUnallocatedParallelMaterialAnnotations",
        summary = "Read unallocated historical parallel annotations as the authorized teacher",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(value = [
        ApiResponse(responseCode = "200", description = "Historical unallocated annotation"),
        ApiResponse(responseCode = "204", description = "No historical annotation", content = [Content()]),
        ApiResponse(responseCode = "403", description = "Teacher access denied", content = [Content()]),
        ApiResponse(responseCode = "404", description = "Parallel lesson or historical material not found", content = [Content()]),
    ])
    fun unallocatedParallelMaterialAnnotations(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable materialId: UUID,
    ): ResponseEntity<MaterialAnnotationResponse> =
        annotations.getUnallocatedAnnotations(authentication, lessonId, materialId)
            ?.let { ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(it) }
            ?: ResponseEntity.noContent().cacheControl(CacheControl.noStore().cachePrivate()).build()

    @GetMapping("/schedule/lessons/{lessonId}/materials/{materialId}/students/{studentSubject}/parallel-annotations", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getParallelStudentLegacyAnnotations",
        summary = "Read an assigned student's separate older-client annotation layer",
        description = "The authorized lesson manager may read the selected student's sanitized legacy layer. Responses are private and not cacheable.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(value = [
        ApiResponse(responseCode = "200", description = "Assigned student's legacy annotation"),
        ApiResponse(responseCode = "204", description = "No legacy annotation", content = [Content()]),
        ApiResponse(responseCode = "403", description = "Lesson management access denied", content = [Content()]),
        ApiResponse(responseCode = "404", description = "Parallel lesson or student assignment not found", content = [Content()]),
    ])
    fun parallelStudentAnnotations(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable materialId: UUID,
        @PathVariable studentSubject: String,
    ): ResponseEntity<MaterialAnnotationResponse> =
        annotations.getParallelStudentAnnotations(authentication, lessonId, materialId, studentSubject)
            ?.let { ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(it) }
            ?: ResponseEntity.noContent().cacheControl(CacheControl.noStore().cachePrivate()).build()

    @GetMapping("/schedule/lessons/{lessonId}/materials/{materialId}/unallocated-annotation-snapshots", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listUnallocatedParallelAnnotationSnapshots",
        summary = "Read unallocated snapshots retained from older clients as the authorized teacher",
        description = "Only the authorized teacher may read snapshots that contain ambiguous historical annotations.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(value = [
        ApiResponse(responseCode = "200", description = "Retained unallocated snapshots, without student attribution"),
        ApiResponse(responseCode = "400", description = "Invalid page", content = [Content()]),
        ApiResponse(responseCode = "403", description = "Teacher access denied", content = [Content()]),
        ApiResponse(responseCode = "404", description = "Parallel lesson or historical material not found", content = [Content()]),
    ])
    fun unallocatedParallelAnnotationSnapshots(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable materialId: UUID,
        @Parameter(schema = Schema(type = "integer", format = "int32", minimum = "0", maximum = "100000", defaultValue = "0"))
        @RequestParam(defaultValue = "0") page: Int,
    ): ResponseEntity<UnallocatedAnnotationSnapshotPage> = ResponseEntity.ok()
        .cacheControl(CacheControl.noStore().cachePrivate())
        .body(annotations.getUnallocatedAnnotationSnapshots(authentication, lessonId, materialId, page))

    @GetMapping("/schedule/lessons/{lessonId}/material-annotation", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getScheduledLessonMaterialAnnotation",
        summary = "Get the authorized lesson material annotation layer",
        description = "Returns the shared layer in SHARED or the authenticated student's separate legacy layer in PARALLEL. Teacher access to the latter is denied.",
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
        annotations.getAnnotationForScheduledLesson(authentication, lessonId)

    @PutMapping(
        "/schedule/lessons/{lessonId}/material-annotation",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "saveScheduledLessonMaterialAnnotation",
        summary = "Save the authorized lesson material annotation layer",
        description = "Saves the shared layer in SHARED or the authenticated student's separate legacy layer in PARALLEL.",
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
        annotations.saveAnnotationForScheduledLesson(authentication, lessonId, request)

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
