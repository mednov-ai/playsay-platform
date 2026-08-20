package com.playsay.payment.controller

import com.playsay.contract.payment.model.CreatePaymentInvoiceRequest
import com.playsay.contract.payment.model.CreatedPaymentInvoiceResponse
import com.playsay.contract.payment.model.PaymentCheckoutResponse
import com.playsay.contract.payment.model.PaymentInvoiceDetailResponse
import com.playsay.contract.payment.model.PaymentInvoiceResponse
import com.playsay.contract.payment.model.PaymentProviderEventResponse
import com.playsay.payment.mapper.toCommand
import com.playsay.payment.mapper.toResponse
import com.playsay.payment.service.PaymentInvoiceOperations
import com.playsay.payment.utils.rawBodyUtf8
import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

private const val PAYMENT_SERVICE_TOKEN_HEADER = "X-PlaySay-Payment-Service-Token"

@RestController
class PaymentInternalController(
    private val store: PaymentInvoiceOperations,
    @param:Value("\${playsay.payment-service.service-token}") private val serviceToken: String,
) {
    @PostMapping("/internal/admin/payment-invoices")
    fun createInvoice(
        @RequestHeader(PAYMENT_SERVICE_TOKEN_HEADER, required = false) token: String?,
        @RequestBody request: CreatePaymentInvoiceRequest,
    ): ResponseEntity<CreatedPaymentInvoiceResponse> {
        requireServiceToken(token)
        val created = store.createInvoice(request.toCommand())
        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(CreatedPaymentInvoiceResponse(invoice = created.invoice.toResponse(), publicUrlToken = created.publicUrlToken))
    }

    @GetMapping("/internal/admin/payment-invoices")
    fun listInvoices(
        @RequestHeader(PAYMENT_SERVICE_TOKEN_HEADER, required = false) token: String?,
    ): List<PaymentInvoiceResponse> {
        requireServiceToken(token)
        return store.listInvoices().map { invoice -> invoice.toResponse() }
    }

    @GetMapping("/internal/admin/payment-invoices/{invoiceId}")
    fun adminInvoice(
        @RequestHeader(PAYMENT_SERVICE_TOKEN_HEADER, required = false) token: String?,
        @PathVariable invoiceId: UUID,
    ): PaymentInvoiceDetailResponse {
        requireServiceToken(token)
        return store.adminInvoice(invoiceId).toResponse()
    }

    @PostMapping("/internal/admin/payment-invoices/{invoiceId}/cancel")
    fun cancelInvoice(
        @RequestHeader(PAYMENT_SERVICE_TOKEN_HEADER, required = false) token: String?,
        @PathVariable invoiceId: UUID,
    ): PaymentInvoiceResponse {
        requireServiceToken(token)
        return store.cancelInvoice(invoiceId).toResponse()
    }

    @GetMapping("/internal/public/payment-invoices/{publicToken}")
    fun publicInvoice(
        @RequestHeader(PAYMENT_SERVICE_TOKEN_HEADER, required = false) token: String?,
        @PathVariable publicToken: String,
    ): PaymentInvoiceResponse {
        requireServiceToken(token)
        return store.publicInvoice(publicToken).toResponse()
    }

    @PostMapping("/internal/public/payment-invoices/{publicToken}/checkout")
    fun createCheckout(
        @RequestHeader(PAYMENT_SERVICE_TOKEN_HEADER, required = false) token: String?,
        @PathVariable publicToken: String,
    ): PaymentCheckoutResponse {
        requireServiceToken(token)
        return store.createCheckout(publicToken).toResponse()
    }

    @PostMapping("/internal/payment-webhooks/yookassa")
    fun processYooKassaWebhook(
        @RequestHeader(PAYMENT_SERVICE_TOKEN_HEADER, required = false) token: String?,
        request: HttpServletRequest,
    ): PaymentProviderEventResponse {
        requireServiceToken(token)
        return store.processYooKassaWebhook(request.rawBodyUtf8()).toResponse()
    }

    private fun requireServiceToken(token: String?) {
        if (serviceToken.isBlank() || token != serviceToken) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        }
    }
}
