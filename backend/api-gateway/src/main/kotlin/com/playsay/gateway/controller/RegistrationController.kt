package com.playsay.gateway.controller

import com.playsay.gateway.dto.ConfirmRegistrationRequest
import com.playsay.gateway.dto.ForgotPasswordRequest
import com.playsay.gateway.dto.RegistrationResponse
import com.playsay.gateway.dto.ResetPasswordRequest
import com.playsay.gateway.dto.ResendRegistrationRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.service.RegistrationService
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class RegistrationController(
    private val registrationGateway: RegistrationService,
) {
    @PostMapping(
        path = ["/registration/start", "/api/registration/start"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun start(
        @Valid @RequestBody request: StartRegistrationRequest,
        servletRequest: HttpServletRequest,
    ): RegistrationResponse =
        registrationGateway.start(request, clientAddress(servletRequest))

    @PostMapping(
        path = ["/registration/resend", "/api/registration/resend"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun resend(
        @Valid @RequestBody request: ResendRegistrationRequest,
        servletRequest: HttpServletRequest,
    ): RegistrationResponse =
        registrationGateway.resend(request, clientAddress(servletRequest))

    @PostMapping(
        path = ["/registration/confirm", "/api/registration/confirm"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun confirm(@Valid @RequestBody request: ConfirmRegistrationRequest): RegistrationResponse =
        registrationGateway.confirm(request)

    @PostMapping(
        path = ["/registration/forgot-password", "/api/registration/forgot-password"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun forgotPassword(
        @Valid @RequestBody request: ForgotPasswordRequest,
        servletRequest: HttpServletRequest,
    ): RegistrationResponse =
        registrationGateway.forgotPassword(request, clientAddress(servletRequest))

    @PostMapping(
        path = ["/registration/reset-password", "/api/registration/reset-password"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun resetPassword(
        @Valid @RequestBody request: ResetPasswordRequest,
        servletRequest: HttpServletRequest,
    ): RegistrationResponse =
        registrationGateway.resetPassword(request, clientAddress(servletRequest))

    private fun clientAddress(request: HttpServletRequest): String? =
        request.getHeader(xForwardedForHeader)?.takeIf { it.isNotBlank() }
            ?: request.getHeader(xRealIpHeader)?.takeIf { it.isNotBlank() }
            ?: request.remoteAddr?.takeIf { it.isNotBlank() }

    private companion object {
        const val xForwardedForHeader = "X-Forwarded-For"
        const val xRealIpHeader = "X-Real-IP"
    }
}
