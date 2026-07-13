package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.ConfirmRegistrationRequest
import com.playsay.gateway.dto.ForgotPasswordRequest
import com.playsay.gateway.dto.ManagedStudentInviteRequest
import com.playsay.gateway.dto.ManagedStudentInviteResponse
import com.playsay.gateway.dto.ManagedStudentInviteLookupResponse
import com.playsay.gateway.dto.ManagedStudentProvisionResponse
import com.playsay.gateway.dto.ManagedStudentRequest
import com.playsay.gateway.dto.RegistrationResponse
import com.playsay.gateway.dto.ResetPasswordRequest
import com.playsay.gateway.dto.ResendRegistrationRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.dto.StudentInviteConsumeRequest
import com.playsay.gateway.dto.StudentInviteConsumeResponse
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
    fun createManagedStudent(request: ManagedStudentRequest): ManagedStudentProvisionResponse
    fun createManagedStudentInvite(request: ManagedStudentInviteRequest): ManagedStudentInviteResponse
    fun lookupManagedStudentInvite(request: StudentInviteConsumeRequest, clientAddress: String?): ManagedStudentInviteLookupResponse
    fun consumeStudentInvite(request: StudentInviteConsumeRequest, clientAddress: String?): StudentInviteConsumeResponse
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

    override fun createManagedStudent(request: ManagedStudentRequest): ManagedStudentProvisionResponse =
        postJson("/api/internal/managed-students", request, HttpStatus.CREATED, ManagedStudentProvisionResponse::class.java)

    override fun createManagedStudentInvite(request: ManagedStudentInviteRequest): ManagedStudentInviteResponse =
        postJson("/api/internal/managed-student-invites", request, HttpStatus.CREATED, ManagedStudentInviteResponse::class.java)

    override fun lookupManagedStudentInvite(
        request: StudentInviteConsumeRequest,
        clientAddress: String?,
    ): ManagedStudentInviteLookupResponse =
        postJson(
            "/api/internal/managed-student-invites/lookup",
            request,
            HttpStatus.OK,
            ManagedStudentInviteLookupResponse::class.java,
            clientAddress,
        )

    override fun consumeStudentInvite(
        request: StudentInviteConsumeRequest,
        clientAddress: String?,
    ): StudentInviteConsumeResponse =
        postJson("/api/student-invites/consume", request, HttpStatus.OK, StudentInviteConsumeResponse::class.java, clientAddress)

    private fun postJson(path: String, body: Any, expectedStatus: HttpStatus, clientAddress: String? = null): RegistrationResponse =
        postJson(path, body, expectedStatus, RegistrationResponse::class.java, clientAddress)

    private fun <T : Any> postJson(
        path: String,
        body: Any,
        expectedStatus: HttpStatus,
        responseType: Class<T>,
        clientAddress: String? = null,
    ): T {
        val response = send(path, objectMapper.writeValueAsString(body), clientAddress)
        if (response.statusCode() != expectedStatus.value()) {
            logger.warn("registration-service request failed path={} status={}", path, response.statusCode())
            val status = runCatching { HttpStatus.valueOf(response.statusCode()) }.getOrNull()
            val errorCode = when {
                path == "/api/internal/managed-students" && status == HttpStatus.CONFLICT ->
                    MetaData.ErrorCodes.MANAGED_STUDENT_IDENTITY_CONFLICT
                status?.is4xxClientError == true -> MetaData.ErrorCodes.INVALID_REQUEST
                else -> MetaData.ErrorCodes.REGISTRATION_SERVICE_UNAVAILABLE
            }
            throw ProjectResponseException.localized(
                status?.takeIf { it.is4xxClientError } ?: HttpStatus.SERVICE_UNAVAILABLE,
                errorCode,
            )
        }
        return runCatching { objectMapper.readValue(response.body(), responseType) }.getOrElse {
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
