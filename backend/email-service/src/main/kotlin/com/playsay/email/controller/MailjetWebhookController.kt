package com.playsay.email.controller

import com.playsay.email.service.MailjetWebhookService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
class MailjetWebhookController(
    private val webhookService: MailjetWebhookService,
    @param:Value("\${playsay.email-service.service-token}") private val serviceToken: String,
) {
    @PostMapping(
        "/internal/email-provider/mailjet/webhook",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun webhook(
        @RequestHeader("X-PlaySay-Email-Service-Token", required = false) token: String?,
        request: HttpServletRequest,
    ) {
        if (serviceToken.isBlank() || token != serviceToken) throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        val rawBody = request.inputStream.readBytes().toString(Charsets.UTF_8)
        webhookService.process(rawBody)
    }
}
