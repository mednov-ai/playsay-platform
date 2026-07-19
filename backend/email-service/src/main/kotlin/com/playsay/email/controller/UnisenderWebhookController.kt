package com.playsay.email.controller

import com.playsay.email.service.UnisenderWebhookService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
class UnisenderWebhookController(
    private val webhookService: UnisenderWebhookService,
    @param:Value("\${playsay.email-service.service-token}") private val serviceToken: String,
) {
    @PostMapping(
        "/internal/email-provider/unisender/webhook",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun webhook(
        @RequestHeader("X-PlaySay-Email-Service-Token", required = false) token: String?,
        request: HttpServletRequest,
    ) {
        if (serviceToken.isBlank() || token != serviceToken) throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        try {
            val rawBody = request.inputStream.readBytes().toString(Charsets.UTF_8)
            webhookService.process(rawBody)
        } catch (caught: IllegalArgumentException) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED, caught.message)
        }
    }
}
