package com.playsay.gateway.controller

import com.playsay.gateway.dto.MaterialVideoPlaybackRequest
import com.playsay.gateway.dto.MaterialVideoPlaybackResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.MaterialVideoPlaybackService
import com.playsay.gateway.service.YoutubeRelayStreamService
import com.playsay.gateway.utils.MetaData
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@RestController
@Tag(name = "Materials")
class MaterialVideoPlaybackController(
    private val playbackService: MaterialVideoPlaybackService,
    private val relayStreamService: YoutubeRelayStreamService,
) {
    @PostMapping(
        "/materials/{materialId}/video-playback",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createMaterialVideoPlayback",
        summary = "Create material video playback decision",
        description = "Returns the playback mode for a material video block and creates a short-lived RF relay session when allowed.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Video playback decision"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material or block not found", content = [Content()]),
        ],
    )
    fun playback(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @RequestBody request: MaterialVideoPlaybackRequest,
        servletRequest: HttpServletRequest,
    ): MaterialVideoPlaybackResponse =
        playbackService.playback(authentication, materialId, request, servletRequest)

    @GetMapping("/materials/video-playback-sessions/{sessionId}/stream")
    @Operation(
        operationId = "streamMaterialVideoPlaybackSession",
        summary = "Stream a material video playback session",
        description = "Streams a short-lived RF relay session created by the material video playback endpoint.",
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Video stream"),
            ApiResponse(responseCode = "206", description = "Partial video stream"),
            ApiResponse(responseCode = "404", description = "Playback session not found", content = [Content()]),
            ApiResponse(responseCode = "503", description = "Relay unavailable", content = [Content()]),
        ],
    )
    fun stream(
        @PathVariable sessionId: UUID,
        @RequestHeader(HttpHeaders.RANGE, required = false) rangeHeader: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val session = playbackService.findSession(sessionId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.VIDEO_PLAYBACK_SESSION_NOT_FOUND)
        return relayStreamService.stream(session, rangeHeader)
    }
}
