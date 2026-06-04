package com.playsay.payment.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.payment.dto.PaymentProviderHttpRequest
import com.playsay.payment.dto.PaymentProviderHttpResponse
import com.playsay.payment.utils.minorToDecimalString
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.Base64
import java.util.UUID

class DisabledPaymentProviderClient : PaymentProviderClient {
    override fun createPayment(command: ProviderPaymentCreateCommand): ProviderPaymentCreateResult {
        throw IllegalStateException("Payment provider is not configured")
    }

    override fun fetchPayment(providerPaymentId: String): ProviderPaymentStatus {
        throw IllegalStateException("Payment provider is not configured")
    }
}

interface PaymentProviderHttpClient {
    fun send(request: PaymentProviderHttpRequest): PaymentProviderHttpResponse
}

class JavaNetPaymentProviderHttpClient(
    private val httpClient: HttpClient = HttpClient.newHttpClient(),
) : PaymentProviderHttpClient {
    override fun send(request: PaymentProviderHttpRequest): PaymentProviderHttpResponse {
        val builder = HttpRequest.newBuilder(URI.create(request.url))
        request.headers.forEach { (name, value) -> builder.header(name, value) }
        if (request.method == "GET") {
            builder.GET()
        } else {
            builder.method(request.method, HttpRequest.BodyPublishers.ofString(request.body.orEmpty()))
        }
        val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString())
        return PaymentProviderHttpResponse(statusCode = response.statusCode(), body = response.body())
    }
}

class YooKassaPaymentProviderClient(
    apiUrl: String,
    private val shopId: String,
    private val secretKey: String,
    private val httpClient: PaymentProviderHttpClient = JavaNetPaymentProviderHttpClient(),
) : PaymentProviderClient {
    private val apiBaseUrl = apiUrl.trimEnd('/')
    private val objectMapper = jacksonObjectMapper()

    override fun createPayment(command: ProviderPaymentCreateCommand): ProviderPaymentCreateResult {
        val body = objectMapper.writeValueAsString(
            mapOf(
                "amount" to mapOf(
                    "value" to minorToDecimalString(command.amountMinor),
                    "currency" to command.currency,
                ),
                "capture" to true,
                "confirmation" to mapOf(
                    "type" to "redirect",
                    "return_url" to command.returnUrl,
                ),
                "description" to command.description.take(128),
                "metadata" to command.metadata,
            ),
        )
        val response = httpClient.send(
            PaymentProviderHttpRequest(
                method = "POST",
                url = "$apiBaseUrl/payments",
                headers = commonHeaders() + mapOf("Idempotence-Key" to command.idempotenceKey),
                body = body,
            ),
        )
        ensureSuccessful(response)
        val json = objectMapper.readTree(response.body)
        return ProviderPaymentCreateResult(
            providerPaymentId = json.path("id").asText(),
            confirmationUrl = json.path("confirmation").path("confirmation_url").asText(),
            status = json.path("status").asYooKassaStatus(),
        )
    }

    override fun fetchPayment(providerPaymentId: String): ProviderPaymentStatus {
        val response = httpClient.send(
            PaymentProviderHttpRequest(
                method = "GET",
                url = "$apiBaseUrl/payments/$providerPaymentId",
                headers = commonHeaders(),
            ),
        )
        ensureSuccessful(response)
        val json = objectMapper.readTree(response.body)
        return ProviderPaymentStatus(
            providerPaymentId = json.path("id").asText(providerPaymentId),
            status = json.path("status").asYooKassaStatus(),
            amountMinor = decimalStringToMinor(json.path("amount").path("value").asText()),
            currency = json.path("amount").path("currency").asText("RUB"),
            invoiceId = UUID.fromString(json.path("metadata").path("invoiceId").asText()),
            paymentAttemptId = UUID.fromString(json.path("metadata").path("paymentAttemptId").asText()),
        )
    }

    private fun commonHeaders(): Map<String, String> =
        mapOf(
            "Authorization" to "Basic ${Base64.getEncoder().encodeToString("$shopId:$secretKey".toByteArray(Charsets.UTF_8))}",
            "Accept" to "application/json",
            "Content-Type" to "application/json",
        )

    private fun ensureSuccessful(response: PaymentProviderHttpResponse) {
        if (response.statusCode !in 200..299) {
            throw IllegalStateException("YooKassa request failed with HTTP ${response.statusCode}")
        }
    }

    private fun JsonNode.asYooKassaStatus(): PaymentAttemptStatus =
        when (asText()) {
            "succeeded" -> PaymentAttemptStatus.SUCCEEDED
            "canceled" -> PaymentAttemptStatus.CANCELED
            "pending", "waiting_for_capture" -> PaymentAttemptStatus.WAITING_FOR_CONFIRMATION
            else -> PaymentAttemptStatus.FAILED
        }

    private fun decimalStringToMinor(value: String): Long =
        BigDecimal(value).movePointRight(2).setScale(0, RoundingMode.UNNECESSARY).longValueExact()
}
