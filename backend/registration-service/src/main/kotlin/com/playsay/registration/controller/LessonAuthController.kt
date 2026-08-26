package com.playsay.registration.controller

import com.playsay.registration.dto.LessonAuthAssertionCreateRequest
import com.playsay.registration.dto.LessonAuthAssertionCreateResponse
import com.playsay.registration.dto.LessonAuthAssertionRedeemRequest
import com.playsay.registration.dto.LessonAuthAssertionRedeemResponse
import com.playsay.registration.dto.LessonIdentityResolveRequest
import com.playsay.registration.dto.LessonIdentityResolveResponse
import com.playsay.registration.service.CreateLessonAuthAssertionCommand
import com.playsay.registration.service.LessonAuthService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class LessonAuthController(private val service: LessonAuthService) {
    @PostMapping("/api/internal/lesson-auth/identities/resolve")
    fun resolve(@Valid @RequestBody request: LessonIdentityResolveRequest): LessonIdentityResolveResponse? =
        service.resolveVerifiedEmail(request.email)?.let {
            LessonIdentityResolveResponse(it.subject, it.email, it.displayName, it.roles)
        }

    @PostMapping("/api/internal/lesson-auth/assertions")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody request: LessonAuthAssertionCreateRequest): LessonAuthAssertionCreateResponse =
        service.create(
            CreateLessonAuthAssertionCommand(
                request.subject,
                request.browserAttemptId,
                request.clientId,
                request.issuer,
                request.callback,
                request.rememberMe,
            ),
        ).let { LessonAuthAssertionCreateResponse(it.handle, it.expiresAt) }

    @PostMapping(
        "/api/provider/lesson-auth/assertions/redeem",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun redeem(@Valid @RequestBody request: LessonAuthAssertionRedeemRequest): LessonAuthAssertionRedeemResponse =
        service.redeem(request.handle, request.clientId, request.issuer, request.callback)
            .let { LessonAuthAssertionRedeemResponse(it.subject, it.rememberMe) }

    @DeleteMapping("/api/internal/lesson-auth/users/{subject}/sessions/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revokeSession(@PathVariable subject: String, @PathVariable sessionId: String) = service.revokeSession(subject, sessionId)

    @DeleteMapping("/api/internal/lesson-auth/users/{subject}/sessions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revokeAllSessions(@PathVariable subject: String) = service.revokeAllSessions(subject)
}
