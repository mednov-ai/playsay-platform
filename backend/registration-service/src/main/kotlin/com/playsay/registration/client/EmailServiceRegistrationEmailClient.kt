package com.playsay.registration.client

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.registration.service.RegistrationEmailClient
import com.playsay.registration.service.RegistrationEmailCommand
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.stereotype.Component

@Component
@ConditionalOnMissingBean(RegistrationEmailClient::class)
class EmailServiceRegistrationEmailClient(
    private val httpClient: HttpClient,
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.registration.email-service.base-url}") private val emailServiceBaseUrl: String,
    @param:Value("\${playsay.registration.email-service.service-token}") private val serviceToken: String,
) : RegistrationEmailClient {
    override fun sendRegistrationConfirmation(command: RegistrationEmailCommand) {
        val payload = mapOf(
            "to" to command.to,
            "templateKey" to "registration-confirmation",
            "locale" to command.locale,
            "idempotencyKey" to command.idempotencyKey,
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
}
