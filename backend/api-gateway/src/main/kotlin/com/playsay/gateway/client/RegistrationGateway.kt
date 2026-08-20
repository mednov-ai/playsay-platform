package com.playsay.gateway.client

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.registration.model.ConfirmRegistrationRequest as ContractConfirmRegistrationRequest
import com.playsay.contract.registration.model.ForgotPasswordRequest as ContractForgotPasswordRequest
import com.playsay.contract.registration.model.InternalCreateUserRequest
import com.playsay.contract.registration.model.InternalUpdateRolesRequest
import com.playsay.contract.registration.model.InternalUserIdentityResponse
import com.playsay.contract.registration.model.ManagedStudentInviteLookupResponse
import com.playsay.contract.registration.model.ManagedStudentInviteRequest
import com.playsay.contract.registration.model.ManagedStudentInviteResponse
import com.playsay.contract.registration.model.ManagedStudentRequest as ContractManagedStudentRequest
import com.playsay.contract.registration.model.ManagedStudentResponse
import com.playsay.contract.registration.model.RegistrationResponse as ContractRegistrationResponse
import com.playsay.contract.registration.model.ResendRegistrationRequest as ContractResendRegistrationRequest
import com.playsay.contract.registration.model.ResetPasswordRequest as ContractResetPasswordRequest
import com.playsay.contract.registration.model.StartRegistrationRequest as ContractStartRegistrationRequest
import com.playsay.contract.registration.model.StudentInviteConsumeRequest as ContractStudentInviteConsumeRequest
import com.playsay.contract.registration.model.StudentInviteConsumeResponse as ContractStudentInviteConsumeResponse
import com.playsay.gateway.dto.ConfirmRegistrationRequest
import com.playsay.gateway.dto.ForgotPasswordRequest
import com.playsay.gateway.dto.AuthenticationMethodsResponse
import com.playsay.gateway.dto.ManagedStudentRequest
import com.playsay.gateway.dto.RenamePasskeyRequest
import com.playsay.gateway.dto.RegistrationResponse
import com.playsay.gateway.dto.ResetPasswordRequest
import com.playsay.gateway.dto.ResendRegistrationRequest
import com.playsay.gateway.dto.StartRegistrationRequest
import com.playsay.gateway.dto.StudentInviteConsumeRequest
import com.playsay.gateway.dto.StudentInviteConsumeResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.nio.charset.StandardCharsets
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
    fun createManagedStudent(request: ManagedStudentRequest): ManagedStudentResponse
    fun createManagedStudentInvite(request: ManagedStudentInviteRequest): ManagedStudentInviteResponse
    fun lookupManagedStudentInvite(request: StudentInviteConsumeRequest, clientAddress: String?): ManagedStudentInviteLookupResponse
    fun consumeStudentInvite(request: StudentInviteConsumeRequest, clientAddress: String?): StudentInviteConsumeResponse
    fun findExactUser(identifier: String): InternalUserIdentityResponse? = null
    fun createUser(request: InternalCreateUserRequest): InternalUserIdentityResponse =
        throw UnsupportedOperationException("User management is not supported by this registration gateway.")
    fun updateRoles(subject: String, request: InternalUpdateRolesRequest): InternalUserIdentityResponse =
        throw UnsupportedOperationException("User management is not supported by this registration gateway.")
    fun deleteUser(subject: String) {
        throw UnsupportedOperationException("User management is not supported by this registration gateway.")
    }
    fun authenticationMethods(subject: String): AuthenticationMethodsResponse =
        throw UnsupportedOperationException("Authentication method management is not supported by this registration gateway.")
    fun renamePasskey(subject: String, credentialId: String, request: RenamePasskeyRequest): AuthenticationMethodsResponse =
        throw UnsupportedOperationException("Authentication method management is not supported by this registration gateway.")
    fun deletePasskey(subject: String, credentialId: String): AuthenticationMethodsResponse =
        throw UnsupportedOperationException("Authentication method management is not supported by this registration gateway.")
}

@Component
class HttpRegistrationGateway(
    @param:Value("\${playsay.registration-service.base-url:http://registration-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.registration-service.service-token:}")
    private val serviceToken: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build(),
) : RegistrationGateway {
    override fun start(request: StartRegistrationRequest, clientAddress: String?): RegistrationResponse =
        postJson(
            "/api/registration/start",
            request.toContract(),
            HttpStatus.ACCEPTED,
            ContractRegistrationResponse::class.java,
            clientAddress,
        ).toFacade()

    override fun resend(request: ResendRegistrationRequest, clientAddress: String?): RegistrationResponse =
        postJson(
            "/api/registration/resend",
            request.toContract(),
            HttpStatus.ACCEPTED,
            ContractRegistrationResponse::class.java,
            clientAddress,
        ).toFacade()

    override fun confirm(request: ConfirmRegistrationRequest): RegistrationResponse =
        postJson(
            "/api/registration/confirm",
            ContractConfirmRegistrationRequest(request.token),
            HttpStatus.OK,
            ContractRegistrationResponse::class.java,
        ).toFacade()

    override fun forgotPassword(request: ForgotPasswordRequest, clientAddress: String?): RegistrationResponse =
        postJson(
            "/api/registration/forgot-password",
            request.toContract(),
            HttpStatus.ACCEPTED,
            ContractRegistrationResponse::class.java,
            clientAddress,
        ).toFacade()

    override fun resetPassword(request: ResetPasswordRequest, clientAddress: String?): RegistrationResponse =
        postJson(
            "/api/registration/reset-password",
            ContractResetPasswordRequest(request.email, request.code, request.newPassword),
            HttpStatus.OK,
            ContractRegistrationResponse::class.java,
            clientAddress,
        ).toFacade()

    override fun createManagedStudent(request: ManagedStudentRequest): ManagedStudentResponse =
        postJson(
            "/api/internal/managed-students",
            request.toContract(),
            HttpStatus.CREATED,
            ManagedStudentResponse::class.java,
        )

    override fun createManagedStudentInvite(request: ManagedStudentInviteRequest): ManagedStudentInviteResponse =
        postJson("/api/internal/managed-student-invites", request, HttpStatus.CREATED, ManagedStudentInviteResponse::class.java)

    override fun lookupManagedStudentInvite(
        request: StudentInviteConsumeRequest,
        clientAddress: String?,
    ): ManagedStudentInviteLookupResponse =
        postJson(
            "/api/internal/managed-student-invites/lookup",
            ContractStudentInviteConsumeRequest(request.token),
            HttpStatus.OK,
            ManagedStudentInviteLookupResponse::class.java,
            clientAddress,
        )

    override fun consumeStudentInvite(
        request: StudentInviteConsumeRequest,
        clientAddress: String?,
    ): StudentInviteConsumeResponse =
        postJson(
            "/api/student-invites/consume",
            ContractStudentInviteConsumeRequest(request.token),
            HttpStatus.OK,
            ContractStudentInviteConsumeResponse::class.java,
            clientAddress,
        ).toFacade()

    override fun findExactUser(identifier: String): InternalUserIdentityResponse? {
        val path = "/api/internal/user-management/users/exact?identifier=${identifier.urlEncoded()}"
        val response = send(path, "GET", null, null)
        if (response.statusCode() == HttpStatus.NOT_FOUND.value() || response.body().isBlank()) return null
        requireExpected(path, response, HttpStatus.OK)
        return parse(path, response.body(), InternalUserIdentityResponse::class.java)
    }

    override fun createUser(request: InternalCreateUserRequest): InternalUserIdentityResponse =
        requestJson(
            "/api/internal/user-management/users",
            "POST",
            request,
            HttpStatus.CREATED,
            InternalUserIdentityResponse::class.java,
        )

    override fun updateRoles(subject: String, request: InternalUpdateRolesRequest): InternalUserIdentityResponse =
        requestJson(
            "/api/internal/user-management/users/${subject.urlEncoded()}/roles",
            "PUT",
            request,
            HttpStatus.OK,
            InternalUserIdentityResponse::class.java,
        )

    override fun deleteUser(subject: String) {
        val path = "/api/internal/user-management/users/${subject.urlEncoded()}"
        val response = send(path, deleteMethod, null, null)
        requireExpected(path, response, HttpStatus.NO_CONTENT)
    }

    override fun authenticationMethods(subject: String): AuthenticationMethodsResponse {
        val path = "/api/internal/authentication-methods/users/${subject.urlEncoded()}"
        val response = send(path, "GET", null, null)
        requireExpected(path, response, HttpStatus.OK)
        return parse(path, response.body(), AuthenticationMethodsResponse::class.java)
    }

    override fun renamePasskey(
        subject: String,
        credentialId: String,
        request: RenamePasskeyRequest,
    ): AuthenticationMethodsResponse =
        requestJson(
            "/api/internal/authentication-methods/users/${subject.urlEncoded()}/passkeys/${credentialId.urlEncoded()}",
            "PUT",
            request,
            HttpStatus.OK,
            AuthenticationMethodsResponse::class.java,
        )

    override fun deletePasskey(subject: String, credentialId: String): AuthenticationMethodsResponse {
        val path = "/api/internal/authentication-methods/users/${subject.urlEncoded()}/passkeys/${credentialId.urlEncoded()}"
        val response = send(path, deleteMethod, null, null)
        requireExpected(path, response, HttpStatus.OK)
        return parse(path, response.body(), AuthenticationMethodsResponse::class.java)
    }

    private fun <T : Any> postJson(
        path: String,
        body: Any,
        expectedStatus: HttpStatus,
        responseType: Class<T>,
        clientAddress: String? = null,
    ): T {
        val response = send(path, "POST", objectMapper.writeValueAsString(body), clientAddress)
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

    private fun <T : Any> requestJson(
        path: String,
        method: String,
        body: Any,
        expectedStatus: HttpStatus,
        responseType: Class<T>,
    ): T {
        val response = send(path, method, objectMapper.writeValueAsString(body), null)
        requireExpected(path, response, expectedStatus)
        return parse(path, response.body(), responseType)
    }

    private fun requireExpected(path: String, response: HttpResponse<String>, expectedStatus: HttpStatus) {
        if (response.statusCode() == expectedStatus.value()) return
        logger.warn("registration-service request failed path={} status={}", path, response.statusCode())
        val status = runCatching { HttpStatus.valueOf(response.statusCode()) }.getOrNull()
        throw ProjectResponseException.localized(
            status?.takeIf { it.is4xxClientError } ?: HttpStatus.SERVICE_UNAVAILABLE,
            if (status?.is4xxClientError == true) MetaData.ErrorCodes.INVALID_REQUEST else MetaData.ErrorCodes.REGISTRATION_SERVICE_UNAVAILABLE,
        )
    }

    private fun <T : Any> parse(path: String, body: String, responseType: Class<T>): T =
        runCatching { objectMapper.readValue(body, responseType) }.getOrElse {
            logger.warn("registration-service response could not be parsed path={}", path, it)
            throw registrationUnavailable()
        }

    private fun send(path: String, method: String, body: String?, clientAddress: String?): HttpResponse<String> {
        val endpoint = baseUrl.trimEnd('/') + path
        val builder = HttpRequest.newBuilder(URI.create(endpoint))
            .timeout(Duration.ofSeconds(20))
            .header(HttpHeaders.ACCEPT, "application/json")
        if (body != null) builder.header(HttpHeaders.CONTENT_TYPE, "application/json")
        if (path.startsWith("/api/internal/")) {
            if (serviceToken.isBlank()) throw registrationUnavailable()
            builder.header(serviceTokenHeader, serviceToken)
        }
        clientAddress?.takeIf { it.isNotBlank() }?.let { forwardedFor ->
            builder.header(xForwardedForHeader, forwardedFor)
        }
        val request = builder.method(
            method,
            body?.let(HttpRequest.BodyPublishers::ofString) ?: HttpRequest.BodyPublishers.noBody(),
        ).build()
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
        const val serviceTokenHeader = "X-PlaySay-Service-Token"
        val deleteMethod = "D" + "ELETE"
    }
}

private fun StartRegistrationRequest.toContract(): ContractStartRegistrationRequest =
    ContractStartRegistrationRequest(email, password, displayName, locale, returnTo)

private fun ResendRegistrationRequest.toContract(): ContractResendRegistrationRequest =
    ContractResendRegistrationRequest(email, locale, returnTo)

private fun ForgotPasswordRequest.toContract(): ContractForgotPasswordRequest =
    ContractForgotPasswordRequest(email, locale, returnTo)

private fun ManagedStudentRequest.toContract(): ContractManagedStudentRequest =
    ContractManagedStudentRequest(username, firstName, lastName, email)

private fun ContractRegistrationResponse.toFacade(): RegistrationResponse =
    RegistrationResponse(status, continueUrl)

private fun ContractStudentInviteConsumeResponse.toFacade(): StudentInviteConsumeResponse =
    StudentInviteConsumeResponse(
        status = "AUTHENTICATED",
        accessToken = accessToken,
        refreshToken = refreshToken,
        idToken = idToken,
        expiresIn = expiresIn,
        continueUrl = continueUrl,
    )

private fun String.urlEncoded(): String = URLEncoder.encode(this, StandardCharsets.UTF_8)
