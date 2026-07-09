package com.playsay.registration.controller

import com.playsay.registration.dto.ConsumeStudentInviteRequest
import com.playsay.registration.dto.ConsumeStudentInviteResponse
import com.playsay.registration.dto.ManagedStudentInviteLookupResponse
import com.playsay.registration.dto.ManagedStudentInviteRequest
import com.playsay.registration.dto.ManagedStudentInviteResponse
import com.playsay.registration.dto.ManagedStudentRequest
import com.playsay.registration.dto.ManagedStudentResponse
import com.playsay.registration.service.ManagedStudentCommand
import com.playsay.registration.service.ManagedStudentInviteCommand
import com.playsay.registration.service.ManagedStudentRegistrationService
import com.playsay.registration.utils.ClientIpResolver
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class ManagedStudentController(
    private val registrationService: ManagedStudentRegistrationService,
    private val clientIpResolver: ClientIpResolver,
) {
    @PostMapping(
        "/api/internal/managed-students",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun createManagedStudent(@Valid @RequestBody request: ManagedStudentRequest): ManagedStudentResponse {
        val result = registrationService.createManagedStudent(
            ManagedStudentCommand(
                email = request.email,
                displayName = request.displayName,
            ),
        )
        return ManagedStudentResponse(
            subject = result.subject,
            email = result.email,
            displayName = result.displayName,
        )
    }

    @PostMapping(
        "/api/internal/managed-student-invites",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun createManagedStudentInvite(@Valid @RequestBody request: ManagedStudentInviteRequest): ManagedStudentInviteResponse {
        val result = registrationService.createManagedStudentInvite(
            ManagedStudentInviteCommand(
                subject = request.subject,
                email = request.email,
                displayName = request.displayName,
                lessonId = request.lessonId,
                continueUrl = request.continueUrl,
            ),
        )
        return ManagedStudentInviteResponse(token = result.token, expiresAt = result.expiresAt)
    }

    @PostMapping(
        "/api/internal/managed-student-invites/lookup",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun lookupManagedStudentInvite(
        @Valid @RequestBody request: ConsumeStudentInviteRequest,
        servletRequest: HttpServletRequest,
    ): ManagedStudentInviteLookupResponse {
        val result = registrationService.lookupManagedStudentInvite(
            request.token,
            clientIpResolver.resolve(servletRequest),
        )
        return ManagedStudentInviteLookupResponse(
            subject = result.subject,
            email = result.email,
            displayName = result.displayName,
            lessonId = result.lessonId,
            continueUrl = result.continueUrl,
            expiresAt = result.expiresAt,
        )
    }

    @PostMapping(
        "/api/student-invites/consume",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun consumeStudentInvite(
        @Valid @RequestBody request: ConsumeStudentInviteRequest,
        servletRequest: HttpServletRequest,
    ): ConsumeStudentInviteResponse {
        val result = registrationService.consumeManagedStudentInvite(
            request.token,
            clientIpResolver.resolve(servletRequest),
        )
        return ConsumeStudentInviteResponse(
            accessToken = result.accessToken,
            refreshToken = result.refreshToken,
            idToken = result.idToken,
            expiresIn = result.expiresIn,
            continueUrl = result.continueUrl,
        )
    }
}
