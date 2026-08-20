package com.playsay.gateway.client

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.contract.payment.model.CreatePaymentInvoiceRequest
import com.playsay.contract.payment.model.CreatedPaymentInvoiceResponse as ContractCreatedPaymentInvoiceResponse
import com.playsay.contract.payment.model.PaymentCheckoutResponse as ContractPaymentCheckoutResponse
import com.playsay.contract.payment.model.PaymentInvoiceDetailResponse as ContractPaymentInvoiceDetailResponse
import com.playsay.contract.payment.model.PaymentInvoiceResponse as ContractPaymentInvoiceResponse
import com.playsay.contract.payment.model.PaymentProviderEventResponse as ContractPaymentProviderEventResponse
import com.playsay.gateway.dto.PaymentCheckoutResponse
import com.playsay.gateway.dto.PaymentInvoiceCreatedResponse
import com.playsay.gateway.dto.PaymentInvoiceDetailResponse
import com.playsay.gateway.dto.PaymentInvoiceResponse
import com.playsay.gateway.dto.PaymentProviderEventResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.mapper.toFacade
import com.playsay.gateway.utils.MetaData
import com.playsay.integration.http.InternalHttpFailure
import com.playsay.integration.http.InternalHttpMethod
import com.playsay.integration.http.InternalHttpResponse
import com.playsay.integration.http.InternalHttpTransport
import java.net.URLEncoder
import java.net.http.HttpClient
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

interface PaymentServiceClient {
    fun createInvoice(payload: CreatePaymentInvoiceRequest): PaymentInvoiceCreatedResponse
    fun listInvoices(): List<PaymentInvoiceResponse>
    fun adminInvoice(invoiceId: UUID): PaymentInvoiceDetailResponse
    fun cancelInvoice(invoiceId: UUID): PaymentInvoiceResponse
    fun publicInvoice(publicToken: String): PaymentInvoiceResponse
    fun createCheckout(publicToken: String): PaymentCheckoutResponse
    fun processYooKassaWebhook(rawBody: String): PaymentProviderEventResponse
}

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
    private val transport = InternalHttpTransport(
        integration = "payment-service",
        baseUrl = baseUrl,
        serviceTokenHeader = "X-PlaySay-Payment-Service-Token",
        serviceToken = serviceToken,
        httpClient = httpClient,
    )

    override fun createInvoice(payload: CreatePaymentInvoiceRequest): PaymentInvoiceCreatedResponse =
        postJson("/internal/admin/payment-invoices", payload, ContractCreatedPaymentInvoiceResponse::class.java).toFacade()

    override fun listInvoices(): List<PaymentInvoiceResponse> =
        get("/internal/admin/payment-invoices").let { response ->
            handleResponse(response) {
                objectMapper.readValue(response.body, Array<ContractPaymentInvoiceResponse>::class.java)
                    .map { invoice -> invoice.toFacade() }
            }
        }

    override fun adminInvoice(invoiceId: UUID): PaymentInvoiceDetailResponse =
        get("/internal/admin/payment-invoices/$invoiceId").let { response ->
            handleResponse(response) {
                objectMapper.readValue(response.body, ContractPaymentInvoiceDetailResponse::class.java).toFacade()
            }
        }

    override fun cancelInvoice(invoiceId: UUID): PaymentInvoiceResponse =
        postJson(
            "/internal/admin/payment-invoices/$invoiceId/cancel",
            null,
            ContractPaymentInvoiceResponse::class.java,
        ).toFacade()

    override fun publicInvoice(publicToken: String): PaymentInvoiceResponse =
        get("/internal/public/payment-invoices/${path(publicToken)}").let { response ->
            handleResponse(response) {
                objectMapper.readValue(response.body, ContractPaymentInvoiceResponse::class.java).toFacade()
            }
        }

    override fun createCheckout(publicToken: String): PaymentCheckoutResponse =
        postJson(
            "/internal/public/payment-invoices/${path(publicToken)}/checkout",
            null,
            ContractPaymentCheckoutResponse::class.java,
        ).let { checkout ->
            PaymentCheckoutResponse(checkout.invoiceId, checkout.paymentAttemptId, checkout.confirmationUrl)
        }

    override fun processYooKassaWebhook(rawBody: String): PaymentProviderEventResponse =
        postRaw("/internal/payment-webhooks/yookassa", rawBody).let { response ->
            handleResponse(response) {
                objectMapper.readValue(response.body, ContractPaymentProviderEventResponse::class.java).toFacade()
            }
        }

    private fun <T> postJson(path: String, body: Any?, responseType: Class<T>): T =
        postRaw(path, body?.let { objectMapper.writeValueAsString(it) }.orEmpty()).let { response ->
            handleResponse(response) { objectMapper.readValue(response.body, responseType) }
        }

    private fun get(path: String): InternalHttpResponse =
        send(InternalHttpMethod.GET, path)

    private fun postRaw(path: String, body: String): InternalHttpResponse =
        send(InternalHttpMethod.POST, path, body)

    private fun send(method: InternalHttpMethod, path: String, body: String? = null): InternalHttpResponse =
        when (val result = transport.exchange(method, path, body, body?.let { "application/json" })) {
            is InternalHttpResponse -> result
            is InternalHttpFailure -> {
                logger.warn("payment-service request failed path={} failure={}", path, result::class.simpleName)
                throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.PAYMENT_SERVICE_UNAVAILABLE)
            }
        }

    private fun <T> handleResponse(response: InternalHttpResponse, block: () -> T): T {
        if (response.statusCode == HttpStatus.NOT_FOUND.value()) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.PAYMENT_INVOICE_NOT_FOUND)
        }
        if (response.statusCode !in 200..299) {
            logger.warn("payment-service request failed status={}", response.statusCode)
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.PAYMENT_SERVICE_UNAVAILABLE)
        }
        return runCatching { block() }.getOrElse {
            logger.warn("payment-service response could not be parsed status={}", response.statusCode, it)
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.PAYMENT_SERVICE_UNAVAILABLE)
        }
    }

    private fun path(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8)

    companion object {
        private val logger = LoggerFactory.getLogger(HttpPaymentServiceClient::class.java)
    }
}
