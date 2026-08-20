package com.playsay.gateway.controller

import com.playsay.gateway.service.EmailDeliveryAdminService
import com.playsay.gateway.service.MailjetWebhookAuthService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class MailjetWebhookProxyController(
    private val gateway: EmailDeliveryAdminService,
    private val authService: MailjetWebhookAuthService,
) {
    @PostMapping("/webhooks/mailjet", consumes = [MediaType.APPLICATION_JSON_VALUE])
    @ResponseStatus(HttpStatus.OK)
    fun webhook(
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?,
        request: HttpServletRequest,
    ) {
        authService.requireAuthorized(authorization)
        val rawBody = request.inputStream.readBytes().toString(Charsets.UTF_8)
        gateway.forwardMailjetWebhook(rawBody)
    }
}
