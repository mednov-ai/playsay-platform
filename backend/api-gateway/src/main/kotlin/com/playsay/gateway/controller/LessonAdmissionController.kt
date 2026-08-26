package com.playsay.gateway.controller

import com.playsay.gateway.dto.LessonAccessAttemptResponse
import com.playsay.gateway.dto.LessonAccessStatusResponse
import com.playsay.gateway.dto.LessonAdmissionActionRequest
import com.playsay.gateway.dto.LessonAdmissionOverviewResponse
import com.playsay.gateway.dto.LessonLobbyDecisionRequest
import com.playsay.gateway.service.LessonLobbyService
import jakarta.validation.Valid
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
class LessonAdmissionController(private val lobbyService: LessonLobbyService) {
    @PostMapping("/schedule/lessons/{lessonId}/access-attempts/{attemptId}/remembered")
    fun remembered(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable attemptId: UUID,
        @RequestHeader(LESSON_ATTEMPT_SECRET_HEADER) attemptSecret: String,
    ): LessonAccessAttemptResponse = lobbyService.remembered(authentication, lessonId, attemptId, attemptSecret)

    @GetMapping("/schedule/lessons/{lessonId}/admissions")
    fun overview(authentication: JwtAuthenticationToken, @PathVariable lessonId: UUID): LessonAdmissionOverviewResponse =
        lobbyService.overview(authentication, lessonId)

    @PostMapping("/schedule/lessons/{lessonId}/lobby/{attemptId}/approve")
    fun approve(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable attemptId: UUID,
        @Valid @RequestBody request: LessonLobbyDecisionRequest,
    ): LessonAccessStatusResponse = lobbyService.approve(
        authentication, lessonId, attemptId, request.studentSubject, request.expectedRevision,
    )

    @PostMapping("/schedule/lessons/{lessonId}/lobby/{attemptId}/deny")
    fun deny(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable attemptId: UUID,
    ): LessonAccessStatusResponse = lobbyService.deny(authentication, lessonId, attemptId)

    @PostMapping("/schedule/lessons/{lessonId}/admissions/{subject}/kick")
    fun kick(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable subject: String,
        @RequestBody(required = false) request: LessonAdmissionActionRequest?,
    ): LessonAccessStatusResponse = lobbyService.kick(authentication, lessonId, subject, request?.expectedRevision)

    @PostMapping("/schedule/lessons/{lessonId}/admissions/{subject}/readmit")
    fun readmit(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @PathVariable subject: String,
        @RequestBody(required = false) request: LessonAdmissionActionRequest?,
    ): LessonAccessStatusResponse = lobbyService.readmit(authentication, lessonId, subject, request?.expectedRevision)
}
