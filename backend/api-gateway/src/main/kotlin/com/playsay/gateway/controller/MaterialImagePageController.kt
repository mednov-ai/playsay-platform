package com.playsay.gateway.controller

import com.playsay.gateway.dto.LiveLessonImagePageResponse
import com.playsay.gateway.dto.LiveLessonHtmlGamePageResponse
import com.playsay.gateway.dto.MaterialImagePageResponse
import com.playsay.gateway.service.MaterialImagePageService
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
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

@RestController
@Tag(name = "Materials")
class MaterialImagePageController(
    private val service: MaterialImagePageService,
) {
    @PostMapping(
        "/materials/{materialId}/image-page",
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "appendMaterialImagePage",
        summary = "Append a static image page to a reusable material",
        description = "Uploads a JPEG, PNG, WebP, or safe SVG image and appends it as a static image page. Requires material owner or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Image page appended"),
            ApiResponse(responseCode = "400", description = "Invalid image upload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot edit material", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
            ApiResponse(responseCode = "502", description = "Object storage failed", content = [Content()]),
        ],
    )
    fun appendReusableImagePage(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @RequestPart("file") file: MultipartFile,
        @RequestParam(required = false) title: String? = null,
    ): ResponseEntity<MaterialImagePageResponse> =
        ResponseEntity
            .status(HttpStatus.CREATED)
            .body(service.appendReusableImagePage(authentication, materialId, file, title))

    @PostMapping(
        "/schedule/lessons/{lessonId}/image-page",
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "appendScheduledLessonImagePage",
        summary = "Append a static image page during a live scheduled lesson",
        description = "Uploads a JPEG, PNG, WebP, or safe SVG image for the current scheduled lesson. The first upload creates a lesson-specific material copy and assigns it to the lesson. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Live lesson image page appended"),
            ApiResponse(responseCode = "400", description = "Invalid image upload or unsupported lesson mode", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage live lesson materials", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
            ApiResponse(responseCode = "502", description = "Object storage failed", content = [Content()]),
        ],
    )
    fun appendLiveLessonImagePage(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestPart("file") file: MultipartFile,
        @RequestParam(required = false) title: String? = null,
    ): ResponseEntity<LiveLessonImagePageResponse> =
        ResponseEntity
            .status(HttpStatus.CREATED)
            .body(service.appendLiveLessonImagePage(authentication, lessonId, file, title))

    @PostMapping(
        "/schedule/lessons/{lessonId}/html-game-page",
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "appendScheduledLessonHtmlGamePage",
        summary = "Append an HTML game during a live scheduled lesson",
        description = "Uploads a self-contained HTML game and appends it to a lesson-specific material copy. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Live lesson HTML game appended"),
            ApiResponse(responseCode = "400", description = "Invalid HTML game or unsupported lesson mode", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage live lesson materials", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
            ApiResponse(responseCode = "502", description = "Object storage failed", content = [Content()]),
        ],
    )
    fun appendLiveLessonHtmlGamePage(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestPart("file") file: MultipartFile,
    ): ResponseEntity<LiveLessonHtmlGamePageResponse> =
        ResponseEntity
            .status(HttpStatus.CREATED)
            .body(service.appendLiveLessonHtmlGamePage(authentication, lessonId, file))
}
