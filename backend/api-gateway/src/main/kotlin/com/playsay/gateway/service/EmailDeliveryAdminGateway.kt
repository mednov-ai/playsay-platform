package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.EmailDeliveryDetailResponse
import com.playsay.gateway.dto.EmailDeliveryPageResponse
import com.playsay.gateway.dto.EmailDeliveryQuery
import com.playsay.gateway.dto.EmailDeliveryResendResponse
import com.playsay.gateway.dto.EmailServiceResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.nio.charset.StandardCharsets
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
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
) {
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()

    fun requireAdmin(authentication: JwtAuthenticationToken) {
        if (authentication.authorities.none { authority -> authority.authority == MetaData.Authorities.ADMIN }) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.ADMIN_ROLE_REQUIRED)
        }
    }

    fun list(query: EmailDeliveryQuery): EmailDeliveryPageResponse = read(
        get("/internal/admin/email-deliveries?${query.toQueryString()}"),
        EmailDeliveryPageResponse::class.java,
    )

    fun detail(id: java.util.UUID): EmailDeliveryDetailResponse = read(
        get("/internal/admin/email-deliveries/$id"),
        EmailDeliveryDetailResponse::class.java,
    )

    fun resend(id: java.util.UUID): EmailDeliveryResendResponse = read(
        post("/internal/admin/email-deliveries/$id/resend", "{}"),
        EmailDeliveryResendResponse::class.java,
    )

    private fun get(pathAndQuery: String): EmailServiceResponse = exchange(
        HttpRequest.newBuilder(internalUri(pathAndQuery)).GET(),
    )

    fun post(path: String, body: String = ""): EmailServiceResponse = exchange(
        HttpRequest.newBuilder(internalUri(path))
            .header(HttpHeaders.CONTENT_TYPE, "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body)),
    )

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

    private fun exchange(builder: HttpRequest.Builder): EmailServiceResponse {
        val token = serviceToken.takeIf(String::isNotBlank) ?: error("email-service token is missing")
        val response = httpClient.send(
            builder
                .timeout(Duration.ofSeconds(20))
                .header(HttpHeaders.ACCEPT, "application/json")
                .header("X-PlaySay-Email-Service-Token", token)
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        return EmailServiceResponse(response.statusCode(), response.body())
    }

    private fun internalUri(pathAndQuery: String): URI =
        URI.create(baseUrl.trimEnd('/') + pathAndQuery)

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
