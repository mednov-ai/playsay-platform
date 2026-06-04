package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.PaymentCheckoutResponse
import com.playsay.gateway.dto.PaymentInvoiceCreatedResponse
import com.playsay.gateway.dto.PaymentInvoiceDetailResponse
import com.playsay.gateway.dto.PaymentInvoiceResponse
import com.playsay.gateway.dto.PaymentProviderEventResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

interface PaymentServiceClient {
    fun createInvoice(payload: InternalPaymentInvoiceCreatePayload): PaymentInvoiceCreatedResponse
    fun listInvoices(): List<PaymentInvoiceResponse>
    fun adminInvoice(invoiceId: UUID): PaymentInvoiceDetailResponse
    fun cancelInvoice(invoiceId: UUID): PaymentInvoiceResponse
    fun publicInvoice(publicToken: String): PaymentInvoiceResponse
    fun createCheckout(publicToken: String): PaymentCheckoutResponse
    fun processYooKassaWebhook(rawBody: String): PaymentProviderEventResponse
}

data class InternalPaymentInvoiceCreatePayload(
    val amountMinor: Long,
    val currency: String,
    val description: String,
    val createdBySubject: String,
    val studentUserId: UUID?,
    val payerName: String?,
    val payerEmail: String?,
    val payerPhone: String?,
    val dueAt: Instant?,
)

@Component
class HttpPaymentServiceClient(
    @param:Value("\${playsay.payment-service.base-url:http://payment-service.playsay-dev.svc.cluster.local}")
    private val baseUrl: String,
    @param:Value("\${playsay.payment-service.service-token:}")
    private val serviceToken: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build(),
) : PaymentServiceClient {
    override fun createInvoice(payload: InternalPaymentInvoiceCreatePayload): PaymentInvoiceCreatedResponse =
        postJson("/internal/admin/payment-invoices", payload, PaymentInvoiceCreatedResponse::class.java)

    override fun listInvoices(): List<PaymentInvoiceResponse> =
        get("/internal/admin/payment-invoices").let { response ->
            handleResponse(response) {
                objectMapper.readValue(response.body(), Array<PaymentInvoiceResponse>::class.java).toList()
            }
        }

    override fun adminInvoice(invoiceId: UUID): PaymentInvoiceDetailResponse =
        get("/internal/admin/payment-invoices/$invoiceId").let { response ->
            handleResponse(response) { objectMapper.readValue(response.body(), PaymentInvoiceDetailResponse::class.java) }
        }

    override fun cancelInvoice(invoiceId: UUID): PaymentInvoiceResponse =
        postJson("/internal/admin/payment-invoices/$invoiceId/cancel", null, PaymentInvoiceResponse::class.java)

    override fun publicInvoice(publicToken: String): PaymentInvoiceResponse =
        get("/internal/public/payment-invoices/${path(publicToken)}").let { response ->
            handleResponse(response) { objectMapper.readValue(response.body(), PaymentInvoiceResponse::class.java) }
        }

    override fun createCheckout(publicToken: String): PaymentCheckoutResponse =
        postJson("/internal/public/payment-invoices/${path(publicToken)}/checkout", null, PaymentCheckoutResponse::class.java)

    override fun processYooKassaWebhook(rawBody: String): PaymentProviderEventResponse =
        postRaw("/internal/payment-webhooks/yookassa", rawBody).let { response ->
            handleResponse(response) { objectMapper.readValue(response.body(), PaymentProviderEventResponse::class.java) }
        }

    private fun <T> postJson(path: String, body: Any?, responseType: Class<T>): T =
        postRaw(path, body?.let { objectMapper.writeValueAsString(it) }.orEmpty()).let { response ->
            handleResponse(response) { objectMapper.readValue(response.body(), responseType) }
        }

    private fun get(path: String): HttpResponse<String> =
        send(path) { endpoint ->
            HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofSeconds(20))
                .header(HttpHeaders.ACCEPT, "application/json")
                .header("X-PlaySay-Payment-Service-Token", requireToken(path))
                .GET()
                .build()
        }

    private fun postRaw(path: String, body: String): HttpResponse<String> =
        send(path) { endpoint ->
            HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofSeconds(20))
                .header(HttpHeaders.ACCEPT, "application/json")
                .header(HttpHeaders.CONTENT_TYPE, "application/json")
                .header("X-PlaySay-Payment-Service-Token", requireToken(path))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build()
        }

    private fun send(path: String, request: (String) -> HttpRequest): HttpResponse<String> {
        val endpoint = baseUrl.trimEnd('/') + path
        return runCatching {
            httpClient.send(request(endpoint), HttpResponse.BodyHandlers.ofString())
        }.getOrElse {
            logger.warn("payment-service request failed path={}", path, it)
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.PAYMENT_SERVICE_UNAVAILABLE)
        }
    }

    private fun <T> handleResponse(response: HttpResponse<String>, block: () -> T): T {
        if (response.statusCode() == HttpStatus.NOT_FOUND.value()) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.PAYMENT_INVOICE_NOT_FOUND)
        }
        if (response.statusCode() !in 200..299) {
            logger.warn("payment-service request failed status={}", response.statusCode())
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.PAYMENT_SERVICE_UNAVAILABLE)
        }
        return runCatching { block() }.getOrElse {
            logger.warn("payment-service response could not be parsed status={}", response.statusCode(), it)
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.PAYMENT_SERVICE_UNAVAILABLE)
        }
    }

    private fun requireToken(path: String): String {
        val token = serviceToken.trim()
        if (token.isEmpty()) {
            logger.warn("payment-service token is not configured path={}", path)
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.PAYMENT_SERVICE_UNAVAILABLE)
        }
        return token
    }

    private fun path(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8)

    companion object {
        private val logger = LoggerFactory.getLogger(HttpPaymentServiceClient::class.java)
    }
}
