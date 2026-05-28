package com.playsay.gateway.controller

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Date
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*

@RestController
@Tag(name = "Schedule")
class LiveKitRoomController(
    private val store: LiveKitRoomStore,
) {
    @PostMapping(
        "/schedule/lessons/{lessonId}/room-token",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createScheduledLessonRoomToken",
        summary = "Create scheduled lesson video token",
        description = "Returns a short-lived LiveKit join token for a scheduled lesson visible to the current user.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "LiveKit room token"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson not found", content = [Content()]),
            ApiResponse(responseCode = "503", description = "LiveKit is not configured", content = [Content()]),
        ],
    )
    fun createToken(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): LiveKitRoomTokenResponse =
        store.createToken(authentication, lessonId)
}
