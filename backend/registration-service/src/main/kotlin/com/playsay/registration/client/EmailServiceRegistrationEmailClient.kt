package com.playsay.registration.client

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.contract.email.model.TransactionalEmailRequest
import com.playsay.integration.http.InternalHttpFailure
import com.playsay.integration.http.InternalHttpMethod
import com.playsay.integration.http.InternalHttpResponse
import com.playsay.integration.http.InternalHttpTransport
import com.playsay.registration.service.PasswordResetEmailCommand
import com.playsay.registration.service.RegistrationEmailClient
import com.playsay.registration.service.RegistrationEmailCommand
import java.net.http.HttpClient

class EmailServiceRegistrationEmailClient(
    private val httpClient: HttpClient,
    private val objectMapper: ObjectMapper,
    private val emailServiceBaseUrl: String,
    private val serviceToken: String,
) : RegistrationEmailClient {
    private val transport = InternalHttpTransport(
        integration = "email-service",
        baseUrl = emailServiceBaseUrl,
        serviceTokenHeader = "X-PlaySay-Email-Service-Token",
        serviceToken = serviceToken,
        httpClient = httpClient,
    )

    override fun sendRegistrationConfirmation(command: RegistrationEmailCommand) {
        val payload = TransactionalEmailRequest(
            to = command.to,
            templateKey = "registration-confirmation",
            locale = command.locale,
            idempotencyKey = command.idempotencyKey,
            replayUntil = command.replayUntil,
            model = mapOf(
                "displayName" to command.displayName,
                "confirmationUrl" to command.confirmationUrl,
            ),
        )
        send(payload)
    }

    override fun sendPasswordResetCode(command: PasswordResetEmailCommand) {
        val payload = TransactionalEmailRequest(
            to = command.to,
            templateKey = "password-reset-code",
            locale = command.locale,
            idempotencyKey = command.idempotencyKey,
            replayUntil = command.replayUntil,
            model = mapOf(
                "displayName" to command.displayName,
                "code" to command.code,
                "expiresMinutes" to command.expiresMinutes.toString(),
                "resetUrl" to command.resetUrl,
            ),
        )
        send(payload)
    }

    private fun send(payload: TransactionalEmailRequest) {
        when (
            val result = transport.exchange(
                method = InternalHttpMethod.POST,
                path = "/internal/emails/transactional",
                body = objectMapper.writeValueAsString(payload),
                contentType = "application/json",
            )
        ) {
            is InternalHttpResponse -> if (result.statusCode !in 200..299) {
                error("email-service returned HTTP ${result.statusCode}")
            }
            is InternalHttpFailure -> error("email-service request failed: ${result::class.simpleName}")
        }
    }
}
