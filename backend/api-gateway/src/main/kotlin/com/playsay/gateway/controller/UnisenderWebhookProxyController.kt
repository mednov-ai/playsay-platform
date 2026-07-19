package com.playsay.gateway.controller

import com.playsay.gateway.service.EmailDeliveryAdminGateway
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class UnisenderWebhookProxyController(
    private val gateway: EmailDeliveryAdminGateway,
) {
    @GetMapping("/webhooks/unisender")
    @ResponseStatus(org.springframework.http.HttpStatus.OK)
    fun readiness() = Unit

    @PostMapping("/webhooks/unisender", consumes = [MediaType.APPLICATION_JSON_VALUE])
    @ResponseStatus(org.springframework.http.HttpStatus.OK)
    fun webhook(request: HttpServletRequest) {
        val rawBody = request.inputStream.readBytes().toString(Charsets.UTF_8)
        gateway.forwardUnisenderWebhook(rawBody)
    }
}
