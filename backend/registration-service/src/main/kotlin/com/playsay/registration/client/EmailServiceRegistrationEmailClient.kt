package com.playsay.registration.client

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.registration.service.PasswordResetEmailCommand
import com.playsay.registration.service.RegistrationEmailClient
import com.playsay.registration.service.RegistrationEmailCommand
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

class EmailServiceRegistrationEmailClient(
    private val httpClient: HttpClient,
    private val objectMapper: ObjectMapper,
    private val emailServiceBaseUrl: String,
    private val serviceToken: String,
) : RegistrationEmailClient {
    override fun sendRegistrationConfirmation(command: RegistrationEmailCommand) {
        val payload = mapOf(
            "to" to command.to,
            "templateKey" to "registration-confirmation",
            "locale" to command.locale,
            "idempotencyKey" to command.idempotencyKey,
            "replayUntil" to command.replayUntil.toString(),
            "model" to mapOf(
                "displayName" to command.displayName,
                "confirmationUrl" to command.confirmationUrl,
            ),
        )
        val request = HttpRequest.newBuilder(URI.create("${emailServiceBaseUrl.trimEnd('/')}/internal/emails/transactional"))
            .header("content-type", "application/json")
            .header("X-PlaySay-Email-Service-Token", serviceToken)
            .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.discarding())
        if (response.statusCode() !in 200..299) {
            error("email-service returned HTTP ${response.statusCode()}")
        }
    }

    override fun sendPasswordResetCode(command: PasswordResetEmailCommand) {
        val payload = mapOf(
            "to" to command.to,
            "templateKey" to "password-reset-code",
            "locale" to command.locale,
            "idempotencyKey" to command.idempotencyKey,
            "replayUntil" to command.replayUntil.toString(),
            "model" to mapOf(
                "displayName" to command.displayName,
                "code" to command.code,
                "expiresMinutes" to command.expiresMinutes.toString(),
                "resetUrl" to command.resetUrl,
            ),
        )
        val request = HttpRequest.newBuilder(URI.create("${emailServiceBaseUrl.trimEnd('/')}/internal/emails/transactional"))
            .header("content-type", "application/json")
            .header("X-PlaySay-Email-Service-Token", serviceToken)
            .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.discarding())
        if (response.statusCode() !in 200..299) {
            error("email-service returned HTTP ${response.statusCode()}")
        }
    }
}
