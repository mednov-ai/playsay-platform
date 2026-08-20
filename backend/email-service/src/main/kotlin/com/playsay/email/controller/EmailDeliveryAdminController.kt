package com.playsay.email.controller

import com.playsay.contract.email.model.EmailDeliveryDetailResponse
import com.playsay.contract.email.model.EmailDeliveryPageResponse
import com.playsay.contract.email.model.EmailDeliveryResendResponse
import com.playsay.email.service.EmailDeliveryAdminService
import com.playsay.email.service.EmailDeliveryNotFoundException
import com.playsay.email.service.EmailDeliveryResendNotAllowedException
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/internal/admin/email-deliveries")
class EmailDeliveryAdminController(
    private val service: EmailDeliveryAdminService,
    @param:Value("\${playsay.email-service.service-token}") private val serviceToken: String,
) {
    @GetMapping
    fun list(
        @RequestHeader("X-PlaySay-Email-Service-Token", required = false) token: String?,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "25") size: Int,
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) providerStatus: String?,
        @RequestParam(required = false) templateKey: String?,
        @RequestParam(required = false) createdFrom: Instant?,
        @RequestParam(required = false) createdTo: Instant?,
    ): EmailDeliveryPageResponse {
        requireToken(token)
        return service.list(page, size, search, status, providerStatus, templateKey, createdFrom, createdTo)
    }

    @GetMapping("/{id}")
    fun detail(
        @RequestHeader("X-PlaySay-Email-Service-Token", required = false) token: String?,
        @PathVariable id: UUID,
    ): EmailDeliveryDetailResponse {
        requireToken(token)
        return runCatching { service.detail(id) }.getOrElse(::mapError)
    }

    @PostMapping("/{id}/resend")
    fun resend(
        @RequestHeader("X-PlaySay-Email-Service-Token", required = false) token: String?,
        @PathVariable id: UUID,
    ): EmailDeliveryResendResponse {
        requireToken(token)
        return runCatching { service.resend(id) }.getOrElse(::mapError)
    }

    private fun requireToken(token: String?) {
        if (serviceToken.isBlank() || token != serviceToken) throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }

    private fun mapError(error: Throwable): Nothing = when (error) {
        is EmailDeliveryNotFoundException -> throw ResponseStatusException(HttpStatus.NOT_FOUND, error.message)
        is EmailDeliveryResendNotAllowedException -> throw ResponseStatusException(HttpStatus.CONFLICT, error.reason)
        else -> throw error
    }
}
