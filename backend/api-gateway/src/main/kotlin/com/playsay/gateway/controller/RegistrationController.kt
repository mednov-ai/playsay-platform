package com.playsay.gateway.controller

import com.playsay.gateway.dto.ConfirmRegistrationRequest
import com.playsay.gateway.dto.RegistrationResponse
import com.playsay.gateway.dto.ResendRegistrationRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.service.RegistrationGateway
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class RegistrationController(
    private val registrationGateway: RegistrationGateway,
) {
    @PostMapping(
        path = ["/registration/start", "/api/registration/start"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun start(@Valid @RequestBody request: StartRegistrationRequest): RegistrationResponse =
        registrationGateway.start(request)

    @PostMapping(
        path = ["/registration/resend", "/api/registration/resend"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun resend(@Valid @RequestBody request: ResendRegistrationRequest): RegistrationResponse =
        registrationGateway.resend(request)

    @PostMapping(
        path = ["/registration/confirm", "/api/registration/confirm"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun confirm(@Valid @RequestBody request: ConfirmRegistrationRequest): RegistrationResponse =
        registrationGateway.confirm(request)
}
