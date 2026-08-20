package com.playsay.gateway.client

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.email.model.EmailDeliveryDetailResponse as ContractEmailDeliveryDetailResponse
import com.playsay.contract.email.model.EmailDeliveryPageResponse as ContractEmailDeliveryPageResponse
import com.playsay.contract.email.model.EmailDeliveryResendResponse as ContractEmailDeliveryResendResponse
import com.playsay.contract.email.model.EmailDeliverySummaryResponse as ContractEmailDeliverySummaryResponse
import com.playsay.contract.email.model.EmailProviderAttemptResponse as ContractEmailProviderAttemptResponse
import com.playsay.gateway.dto.EmailDeliveryDetailResponse
import com.playsay.gateway.dto.EmailDeliveryPageResponse
import com.playsay.gateway.dto.EmailDeliveryQuery
import com.playsay.gateway.dto.EmailDeliveryResendResponse
import com.playsay.gateway.dto.EmailDeliverySummaryResponse
import com.playsay.gateway.dto.EmailProviderAttemptResponse
import com.playsay.gateway.dto.EmailServiceResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.playsay.integration.http.InternalHttpFailure
import com.playsay.integration.http.InternalHttpMethod
import com.playsay.integration.http.InternalHttpResponse
import com.playsay.integration.http.InternalHttpTransport
import java.net.URLEncoder
import java.net.http.HttpClient
import java.nio.charset.StandardCharsets
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

@Component
class EmailDeliveryAdminGateway(
    @param:Value("\${playsay.email-service.base-url:http://email-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.email-service.service-token:}")
    private val serviceToken: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(java.time.Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build(),
) {
    private val transport = InternalHttpTransport(
        integration = "email-service",
        baseUrl = baseUrl,
        serviceTokenHeader = "X-PlaySay-Email-Service-Token",
        serviceToken = serviceToken,
        httpClient = httpClient,
    )

    fun requireAdmin(authentication: JwtAuthenticationToken) {
        if (authentication.authorities.none { authority -> authority.authority == MetaData.Authorities.ADMIN }) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.ADMIN_ROLE_REQUIRED)
        }
    }

    fun list(query: EmailDeliveryQuery): EmailDeliveryPageResponse = read(
        get("/internal/admin/email-deliveries?${query.toQueryString()}"),
        ContractEmailDeliveryPageResponse::class.java,
    ).toFacade()

    fun detail(id: java.util.UUID): EmailDeliveryDetailResponse = read(
        get("/internal/admin/email-deliveries/$id"),
        ContractEmailDeliveryDetailResponse::class.java,
    ).toFacade()

    fun resend(id: java.util.UUID): EmailDeliveryResendResponse = read(
        post("/internal/admin/email-deliveries/$id/resend", "{}"),
        ContractEmailDeliveryResendResponse::class.java,
    ).toFacade()

    private fun get(pathAndQuery: String): EmailServiceResponse =
        exchange(InternalHttpMethod.GET, pathAndQuery)

    fun post(path: String, body: String = ""): EmailServiceResponse =
        exchange(InternalHttpMethod.POST, path, body)

    fun forwardUnisenderWebhook(rawBody: String) {
        val response = post("/internal/email-provider/unisender/webhook", rawBody)
        if (response.status !in 200..299) {
            throw ProjectResponseException(
                status = HttpStatus.valueOf(response.status),
                message = "Email provider webhook was rejected",
                errorCode = MetaData.ErrorCodes.EMAIL_SERVICE_UNAVAILABLE,
            )
        }
    }

    fun forwardMailjetWebhook(rawBody: String) {
        val response = post("/internal/email-provider/mailjet/webhook", rawBody)
        if (response.status !in 200..299) {
            throw ProjectResponseException(
                status = HttpStatus.valueOf(response.status),
                message = "Email provider webhook was rejected",
                errorCode = MetaData.ErrorCodes.EMAIL_SERVICE_UNAVAILABLE,
            )
        }
    }

    private fun <T> read(response: EmailServiceResponse, responseType: Class<T>): T {
        if (response.status !in 200..299) {
            val (status, errorCode) = when (response.status) {
                HttpStatus.NOT_FOUND.value() -> HttpStatus.NOT_FOUND to MetaData.ErrorCodes.EMAIL_DELIVERY_NOT_FOUND
                HttpStatus.CONFLICT.value() -> HttpStatus.CONFLICT to MetaData.ErrorCodes.EMAIL_DELIVERY_RESEND_NOT_ALLOWED
                else -> HttpStatus.SERVICE_UNAVAILABLE to MetaData.ErrorCodes.EMAIL_SERVICE_UNAVAILABLE
            }
            throw ProjectResponseException.localized(status, errorCode)
        }
        return objectMapper.readValue(response.body, responseType)
    }

    private fun exchange(method: InternalHttpMethod, path: String, body: String? = null): EmailServiceResponse =
        when (val result = transport.exchange(method, path, body, body?.let { "application/json" })) {
            is InternalHttpResponse -> EmailServiceResponse(result.statusCode, result.body)
            is InternalHttpFailure -> error("email-service request failed: ${result::class.simpleName}")
        }

    private fun EmailDeliveryQuery.toQueryString(): String = listOfNotNull(
        "page" to page.toString(),
        "size" to size.toString(),
        search?.takeIf(String::isNotBlank)?.let { "search" to it },
        status?.takeIf(String::isNotBlank)?.let { "status" to it },
        providerStatus?.takeIf(String::isNotBlank)?.let { "providerStatus" to it },
        templateKey?.takeIf(String::isNotBlank)?.let { "templateKey" to it },
        createdFrom?.let { "createdFrom" to it.toString() },
        createdTo?.let { "createdTo" to it.toString() },
    ).joinToString("&") { (key, value) -> "$key=${URLEncoder.encode(value, StandardCharsets.UTF_8)}" }
}

private fun ContractEmailDeliveryPageResponse.toFacade(): EmailDeliveryPageResponse =
    EmailDeliveryPageResponse(items.map(ContractEmailDeliverySummaryResponse::toFacade), page, size, totalElements, totalPages)

private fun ContractEmailDeliveryDetailResponse.toFacade(): EmailDeliveryDetailResponse =
    EmailDeliveryDetailResponse(delivery.toFacade(), attempts.map(ContractEmailProviderAttemptResponse::toFacade))

private fun ContractEmailDeliveryResendResponse.toFacade(): EmailDeliveryResendResponse =
    EmailDeliveryResendResponse(deliveryAttemptId, status, provider, providerStatus)

private fun ContractEmailDeliverySummaryResponse.toFacade(): EmailDeliverySummaryResponse =
    EmailDeliverySummaryResponse(
        id = id,
        toEmail = toEmail,
        templateKey = templateKey,
        locale = locale,
        subject = subject,
        status = status,
        provider = provider,
        providerStatus = providerStatus,
        providerDeliveryStatus = providerDeliveryStatus,
        providerDestinationResponse = providerDestinationResponse,
        providerAttemptCount = providerAttemptCount,
        providerEventAt = providerEventAt,
        providerCheckedAt = providerCheckedAt,
        providerTrackingUntil = providerTrackingUntil,
        resendAllowed = resendAllowed,
        resendReason = resendReason,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun ContractEmailProviderAttemptResponse.toFacade(): EmailProviderAttemptResponse =
    EmailProviderAttemptResponse(
        id = id,
        attemptNumber = attemptNumber,
        provider = provider,
        providerJobId = providerJobId,
        providerStatus = providerStatus,
        providerDeliveryStatus = providerDeliveryStatus,
        providerDestinationResponse = providerDestinationResponse,
        providerEventAt = providerEventAt,
        providerCheckedAt = providerCheckedAt,
        trackingUntil = trackingUntil,
        errorMessage = errorMessage,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
