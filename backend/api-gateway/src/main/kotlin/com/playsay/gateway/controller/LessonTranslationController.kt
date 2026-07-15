package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonTranslationSessionResponse
import com.playsay.gateway.service.LessonTranslationService
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
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Schedule")
class LessonTranslationController(
    private val translation: LessonTranslationService,
) {
    @PostMapping(
        "/schedule/lessons/{lessonId}/translation-session",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createLessonTranslationSession",
        summary = "Create a realtime lesson translation session",
        description = "Returns a short-lived listener-side credential for a two-person individual lesson.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Realtime translation credential"),
            ApiResponse(responseCode = "401", description = "Authentication is required", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user is not the lesson teacher or student", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Active lesson not found", content = [Content()]),
            ApiResponse(responseCode = "409", description = "Translation is unavailable for the lesson or profile language", content = [Content()]),
            ApiResponse(responseCode = "503", description = "Realtime translation provider is unavailable", content = [Content()]),
        ],
    )
    fun createSession(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): LessonTranslationSessionResponse = translation.createSession(authentication, lessonId)
}
