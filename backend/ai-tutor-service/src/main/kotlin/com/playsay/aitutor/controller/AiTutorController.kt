package com.playsay.aitutor.controller

import com.playsay.aitutor.dto.*
import com.playsay.aitutor.service.AiTutorCatalogService
import com.playsay.aitutor.service.AiTutorSessionService
import com.playsay.aitutor.service.LearnerAgePolicyService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/ai-tutor")
class AiTutorController(
    private val catalog: AiTutorCatalogService,
    private val sessions: AiTutorSessionService,
    private val agePolicy: LearnerAgePolicyService,
) {
    @GetMapping("/personas")
    fun personas(authentication: JwtAuthenticationToken) = catalog.personas(agePolicy.resolve(authentication.token.subject))

    @GetMapping("/scenarios")
    fun scenarios(authentication: JwtAuthenticationToken) = catalog.scenarios(agePolicy.resolve(authentication.token.subject))

    @PostMapping("/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(authentication: JwtAuthenticationToken, @Valid @RequestBody request: CreateSessionRequest) =
        sessions.create(authentication.token.subject, request)

    @PostMapping("/sessions/{sessionId}/events")
    fun event(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID, @Valid @RequestBody request: SessionEventRequest) =
        sessions.appendEvent(authentication.token.subject, sessionId, request)

    @PostMapping("/sessions/{sessionId}/finish")
    fun finish(authentication: JwtAuthenticationToken, @PathVariable sessionId: UUID) =
        sessions.finish(authentication.token.subject, sessionId)

    @GetMapping("/progress")
    fun progress(authentication: JwtAuthenticationToken) = sessions.progress(authentication.token.subject)

    @PostMapping("/assessment")
    fun assessment(@Valid @RequestBody request: AssessmentRequest) = sessions.assess(request)
}
