package com.playsay.gateway.controller

import com.playsay.gateway.dto.StudentInviteConsumeRequest
import com.playsay.gateway.dto.StudentInviteConsumeResponse
import com.playsay.gateway.service.RegistrationGateway
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class StudentInviteController(
    private val registrationGateway: RegistrationGateway,
) {
    @PostMapping(
        path = ["/student-invites/consume", "/api/student-invites/consume"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun consume(
        @Valid @RequestBody request: StudentInviteConsumeRequest,
        servletRequest: HttpServletRequest,
    ): StudentInviteConsumeResponse =
        registrationGateway.consumeStudentInvite(request, clientAddress(servletRequest))

    private fun clientAddress(request: HttpServletRequest): String? =
        firstForwardedAddress(request.getHeader(xForwardedForHeader))
            ?: cleanAddress(request.getHeader(xRealIpHeader))
            ?: cleanAddress(request.remoteAddr)

    private fun firstForwardedAddress(value: String?): String? =
        value
            ?.split(",")
            ?.firstNotNullOfOrNull(::cleanAddress)

    private fun cleanAddress(value: String?): String? {
        val cleaned = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return cleaned.takeIf { it.length <= maxAddressLength && it.none(Char::isISOControl) }
    }

    private companion object {
        const val xForwardedForHeader = "X-Forwarded-For"
        const val xRealIpHeader = "X-Real-IP"
        const val maxAddressLength = 128
    }
}
