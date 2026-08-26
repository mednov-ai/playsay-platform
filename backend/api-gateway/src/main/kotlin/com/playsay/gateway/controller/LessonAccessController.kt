package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonAccessAttemptResponse
import com.playsay.gateway.dto.LessonAccessLinkResponse
import com.playsay.gateway.dto.LessonAccessStartRequest
import com.playsay.gateway.service.LessonAccessLinkService
import jakarta.validation.Valid
import java.util.UUID
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

internal const val LESSON_ATTEMPT_SECRET_HEADER = "X-Honey-Lesson-Attempt"

@RestController
@RequestMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
class LessonAccessController(private val service: LessonAccessLinkService) {
    @GetMapping("/schedule/lessons/{lessonId}/access-link")
    fun getOrCreate(authentication: JwtAuthenticationToken, @PathVariable lessonId: UUID): LessonAccessLinkResponse =
        service.getOrCreate(authentication, lessonId)

    @PostMapping("/schedule/lessons/{lessonId}/access-link/rotate")
    fun rotate(authentication: JwtAuthenticationToken, @PathVariable lessonId: UUID): LessonAccessLinkResponse =
        service.rotate(authentication, lessonId)

    @DeleteMapping("/schedule/lessons/{lessonId}/access-link")
    fun revoke(authentication: JwtAuthenticationToken, @PathVariable lessonId: UUID): ResponseEntity<Void> {
        service.revoke(authentication, lessonId)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/public/lesson-access/{lessonId}/start")
    fun start(
        @PathVariable lessonId: UUID,
        @RequestHeader(HttpHeaders.ORIGIN) origin: String,
        @Valid @RequestBody request: LessonAccessStartRequest,
    ): LessonAccessAttemptResponse = service.start(lessonId, request.token, origin)
}
