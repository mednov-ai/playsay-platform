package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.ConfirmRegistrationRequest
import com.playsay.gateway.dto.ForgotPasswordRequest
import com.playsay.gateway.dto.RegistrationResponse
import com.playsay.gateway.dto.ResetPasswordRequest
import com.playsay.gateway.dto.ResendRegistrationRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

interface RegistrationGateway {
    fun start(request: StartRegistrationRequest, clientAddress: String?): RegistrationResponse
    fun resend(request: ResendRegistrationRequest, clientAddress: String?): RegistrationResponse
    fun confirm(request: ConfirmRegistrationRequest): RegistrationResponse
    fun forgotPassword(request: ForgotPasswordRequest, clientAddress: String?): RegistrationResponse
    fun resetPassword(request: ResetPasswordRequest, clientAddress: String?): RegistrationResponse
}

@Component
class HttpRegistrationGateway(
    @param:Value("\${playsay.registration-service.base-url:http://registration-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build(),
) : RegistrationGateway {
    override fun start(request: StartRegistrationRequest, clientAddress: String?): RegistrationResponse =
        postJson("/api/registration/start", request, HttpStatus.ACCEPTED, clientAddress)

    override fun resend(request: ResendRegistrationRequest, clientAddress: String?): RegistrationResponse =
        postJson("/api/registration/resend", request, HttpStatus.ACCEPTED, clientAddress)

    override fun confirm(request: ConfirmRegistrationRequest): RegistrationResponse =
        postJson("/api/registration/confirm", request, HttpStatus.OK)

    override fun forgotPassword(request: ForgotPasswordRequest, clientAddress: String?): RegistrationResponse =
        postJson("/api/registration/forgot-password", request, HttpStatus.ACCEPTED, clientAddress)

    override fun resetPassword(request: ResetPasswordRequest, clientAddress: String?): RegistrationResponse =
        postJson("/api/registration/reset-password", request, HttpStatus.OK, clientAddress)

    private fun postJson(path: String, body: Any, expectedStatus: HttpStatus, clientAddress: String? = null): RegistrationResponse {
        val response = send(path, objectMapper.writeValueAsString(body), clientAddress)
        if (response.statusCode() != expectedStatus.value()) {
            logger.warn("registration-service request failed path={} status={}", path, response.statusCode())
            val status = runCatching { HttpStatus.valueOf(response.statusCode()) }.getOrNull()
            throw ProjectResponseException.localized(
                status?.takeIf { it.is4xxClientError } ?: HttpStatus.SERVICE_UNAVAILABLE,
                status?.takeIf { it.is4xxClientError }?.let { MetaData.ErrorCodes.INVALID_REQUEST }
                    ?: MetaData.ErrorCodes.REGISTRATION_SERVICE_UNAVAILABLE,
            )
        }
        return runCatching { objectMapper.readValue(response.body(), RegistrationResponse::class.java) }.getOrElse {
            logger.warn("registration-service response could not be parsed path={}", path, it)
            throw registrationUnavailable()
        }
    }

    private fun send(path: String, body: String, clientAddress: String?): HttpResponse<String> {
        val endpoint = baseUrl.trimEnd('/') + path
        val builder = HttpRequest.newBuilder(URI.create(endpoint))
            .timeout(Duration.ofSeconds(20))
            .header(HttpHeaders.ACCEPT, "application/json")
            .header(HttpHeaders.CONTENT_TYPE, "application/json")
        clientAddress?.takeIf { it.isNotBlank() }?.let { forwardedFor ->
            builder.header(xForwardedForHeader, forwardedFor)
        }
        val request = builder.POST(HttpRequest.BodyPublishers.ofString(body)).build()
        return runCatching { httpClient.send(request, HttpResponse.BodyHandlers.ofString()) }.getOrElse {
            logger.warn("registration-service request failed path={}", path, it)
            throw registrationUnavailable()
        }
    }

    private fun registrationUnavailable(): ProjectResponseException =
        ProjectResponseException.localized(
            HttpStatus.SERVICE_UNAVAILABLE,
            MetaData.ErrorCodes.REGISTRATION_SERVICE_UNAVAILABLE,
        )

    private companion object {
        private val logger = LoggerFactory.getLogger(HttpRegistrationGateway::class.java)
        const val xForwardedForHeader = "X-Forwarded-For"
    }
}
