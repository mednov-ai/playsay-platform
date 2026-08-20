package com.playsay.registration.controller

import com.playsay.contract.registration.model.ManagedStudentInviteLookupResponse
import com.playsay.contract.registration.model.ManagedStudentInviteRequest
import com.playsay.contract.registration.model.ManagedStudentInviteResponse
import com.playsay.contract.registration.model.ManagedStudentRequest
import com.playsay.contract.registration.model.ManagedStudentResponse
import com.playsay.contract.registration.model.StudentInviteConsumeRequest
import com.playsay.contract.registration.model.StudentInviteConsumeResponse
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
                username = request.username,
                firstName = request.firstName,
                lastName = request.lastName,
                email = request.email,
            ),
        )
        return ManagedStudentResponse(
            subject = result.subject,
            username = result.username,
            email = result.email,
            firstName = result.firstName,
            lastName = result.lastName,
            displayName = listOfNotNull(result.firstName, result.lastName).joinToString(" "),
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
                username = request.username,
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
        @Valid @RequestBody request: StudentInviteConsumeRequest,
        servletRequest: HttpServletRequest,
    ): ManagedStudentInviteLookupResponse {
        val result = registrationService.lookupManagedStudentInvite(
            request.token,
            clientIpResolver.resolve(servletRequest),
        )
        return ManagedStudentInviteLookupResponse(
            subject = result.subject,
            username = result.username,
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
        @Valid @RequestBody request: StudentInviteConsumeRequest,
        servletRequest: HttpServletRequest,
    ): StudentInviteConsumeResponse {
        val result = registrationService.consumeManagedStudentInvite(
            request.token,
            clientIpResolver.resolve(servletRequest),
        )
        return StudentInviteConsumeResponse(
            accessToken = result.accessToken,
            refreshToken = result.refreshToken,
            idToken = result.idToken,
            expiresIn = result.expiresIn,
            continueUrl = result.continueUrl,
        )
    }
}
