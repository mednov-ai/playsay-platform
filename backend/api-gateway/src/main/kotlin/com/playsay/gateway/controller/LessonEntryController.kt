package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonAccessAttemptResponse
import com.playsay.gateway.dto.LessonAccessStatusResponse
import com.playsay.gateway.dto.LessonEmailCodeRequest
import com.playsay.gateway.dto.LessonEmailCodeVerifyRequest
import com.playsay.gateway.dto.LessonLobbyRequest
import com.playsay.gateway.service.LessonEmailChallengeService
import com.playsay.gateway.service.LessonLobbyService
import jakarta.validation.Valid
import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
class LessonEntryController(
    private val emailChallengeService: LessonEmailChallengeService,
    private val lobbyService: LessonLobbyService,
) {
    @PostMapping("/public/lesson-access/{lessonId}/attempts/{attemptId}/email-code")
    fun requestEmailCode(
        @PathVariable lessonId: UUID,
        @PathVariable attemptId: UUID,
        @RequestHeader(LESSON_ATTEMPT_SECRET_HEADER) attemptSecret: String,
        @Valid @RequestBody request: LessonEmailCodeRequest,
        servletRequest: HttpServletRequest,
    ): ResponseEntity<LessonAccessStatusResponse> = ResponseEntity.accepted().body(
        emailChallengeService.requestCode(lessonId, attemptId, attemptSecret, request.email, request.locale, servletRequest.remoteAddr),
    )

    @PostMapping("/public/lesson-access/{lessonId}/attempts/{attemptId}/email-code/verify")
    fun verifyEmailCode(
        @PathVariable lessonId: UUID,
        @PathVariable attemptId: UUID,
        @RequestHeader(LESSON_ATTEMPT_SECRET_HEADER) attemptSecret: String,
        @Valid @RequestBody request: LessonEmailCodeVerifyRequest,
    ): LessonAccessAttemptResponse = emailChallengeService.verifyCode(
        lessonId, attemptId, attemptSecret, request.code, request.rememberMe,
    )

    @PostMapping("/public/lesson-access/{lessonId}/attempts/{attemptId}/lobby")
    fun requestLobby(
        @PathVariable lessonId: UUID,
        @PathVariable attemptId: UUID,
        @RequestHeader(LESSON_ATTEMPT_SECRET_HEADER) attemptSecret: String,
        @Valid @RequestBody request: LessonLobbyRequest,
    ): LessonAccessStatusResponse = lobbyService.requestLobby(lessonId, attemptId, attemptSecret, request.displayLabel)

    @GetMapping("/public/lesson-access/{lessonId}/attempts/{attemptId}/status")
    fun status(
        @PathVariable lessonId: UUID,
        @PathVariable attemptId: UUID,
        @RequestHeader(LESSON_ATTEMPT_SECRET_HEADER) attemptSecret: String,
    ): LessonAccessAttemptResponse = lobbyService.status(lessonId, attemptId, attemptSecret)
}
