package com.playsay.registration.controller

import com.playsay.registration.dto.ConfirmRegistrationRequest
import com.playsay.registration.dto.RegistrationResponse
import com.playsay.registration.dto.ResendRegistrationRequest
import com.playsay.registration.dto.StartRegistrationRequest
import com.playsay.registration.service.RegistrationService
import com.playsay.registration.service.ResendRegistrationCommand
import com.playsay.registration.service.StartRegistrationCommand
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/registration")
class RegistrationController(
    private val registrationService: RegistrationService,
) {
    @PostMapping(
        "/start",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun start(
        @Valid @RequestBody request: StartRegistrationRequest,
        servletRequest: HttpServletRequest,
    ): RegistrationResponse {
        val result = registrationService.start(
            StartRegistrationCommand(
                email = request.email,
                password = request.password,
                displayName = request.displayName,
                locale = request.locale,
                returnTo = request.returnTo,
                remoteAddress = servletRequest.remoteAddr,
            ),
        )
        return RegistrationResponse(status = result.status, continueUrl = result.continueUrl)
    }

    @PostMapping(
        "/resend",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun resend(
        @Valid @RequestBody request: ResendRegistrationRequest,
        servletRequest: HttpServletRequest,
    ): RegistrationResponse {
        val result = registrationService.resend(
            ResendRegistrationCommand(
                email = request.email,
                locale = request.locale,
                returnTo = request.returnTo,
                remoteAddress = servletRequest.remoteAddr,
            ),
        )
        return RegistrationResponse(status = result.status, continueUrl = result.continueUrl)
    }

    @PostMapping(
        "/confirm",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun confirm(@Valid @RequestBody request: ConfirmRegistrationRequest): RegistrationResponse {
        val result = registrationService.confirm(request.token)
        return RegistrationResponse(status = result.status, continueUrl = result.continueUrl)
    }
}
