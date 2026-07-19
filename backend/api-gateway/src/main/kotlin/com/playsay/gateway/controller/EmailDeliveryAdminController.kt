package com.playsay.gateway.controller

import com.playsay.gateway.dto.EmailDeliveryDetailResponse
import com.playsay.gateway.dto.EmailDeliveryPageResponse
import com.playsay.gateway.dto.EmailDeliveryQuery
import com.playsay.gateway.dto.EmailDeliveryResendResponse
import com.playsay.gateway.service.EmailDeliveryAdminGateway
import io.swagger.v3.oas.annotations.Operation
import java.time.Instant
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class EmailDeliveryAdminController(
    private val gateway: EmailDeliveryAdminGateway,
) {
    @GetMapping("/admin/email-deliveries", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "listEmailDeliveries", summary = "List transactional email deliveries")
    fun list(
        authentication: JwtAuthenticationToken,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "25") size: Int,
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) providerStatus: String?,
        @RequestParam(required = false) templateKey: String?,
        @RequestParam(required = false) createdFrom: Instant?,
        @RequestParam(required = false) createdTo: Instant?,
    ): EmailDeliveryPageResponse {
        gateway.requireAdmin(authentication)
        return gateway.list(
            EmailDeliveryQuery(page, size, search, status, providerStatus, templateKey, createdFrom, createdTo),
        )
    }

    @GetMapping("/admin/email-deliveries/{id}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "getEmailDelivery", summary = "Get transactional email delivery details")
    fun detail(authentication: JwtAuthenticationToken, @PathVariable id: UUID): EmailDeliveryDetailResponse {
        gateway.requireAdmin(authentication)
        return gateway.detail(id)
    }

    @PostMapping("/admin/email-deliveries/{id}/resend", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "resendEmailDelivery", summary = "Resend an eligible transactional email")
    fun resend(authentication: JwtAuthenticationToken, @PathVariable id: UUID): EmailDeliveryResendResponse {
        gateway.requireAdmin(authentication)
        return gateway.resend(id)
    }
}
