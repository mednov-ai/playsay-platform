package com.playsay.email.controller

import com.playsay.email.dto.TransactionalEmailRequest
import com.playsay.email.dto.TransactionalEmailResponse
import com.playsay.email.service.TransactionalEmailCommand
import com.playsay.email.service.TransactionalEmailService
import jakarta.validation.Valid
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/internal/emails")
class EmailInternalController(
    private val emailService: TransactionalEmailService,
    @param:Value("\${playsay.email-service.service-token}") private val serviceToken: String,
) {
    @PostMapping(
        "/transactional",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun sendTransactional(
        @RequestHeader("X-PlaySay-Email-Service-Token", required = false) token: String?,
        @Valid @RequestBody request: TransactionalEmailRequest,
    ): TransactionalEmailResponse {
        if (serviceToken.isBlank() || token != serviceToken) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        }
        val status = emailService.send(
            TransactionalEmailCommand(
                to = request.to.trim(),
                templateKey = request.templateKey.trim(),
                locale = request.locale,
                idempotencyKey = request.idempotencyKey.trim(),
                model = request.model,
                replayUntil = request.replayUntil,
            ),
        )
        return TransactionalEmailResponse(
            status = status.status,
            deliveryAttemptId = status.deliveryAttemptId,
            provider = status.provider,
            providerStatus = status.providerStatus,
        )
    }
}
