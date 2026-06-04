package com.playsay.gateway.controller

import com.playsay.gateway.dto.PaymentInvoiceCreateRequest
import com.playsay.gateway.dto.PaymentInvoiceCreatedResponse
import com.playsay.gateway.dto.PaymentInvoiceDetailResponse
import com.playsay.gateway.dto.PaymentInvoiceResponse
import com.playsay.gateway.dto.PaymentProviderEventResponse
import com.playsay.gateway.dto.PublicPaymentCheckoutResponse
import com.playsay.gateway.dto.PublicPaymentInvoiceResponse
import com.playsay.gateway.service.PaymentInvoiceFacade
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class PaymentController(
    private val paymentInvoiceFacade: PaymentInvoiceFacade,
) {
    @PostMapping(
        "/payments/admin/invoices",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun createInvoice(
        authentication: JwtAuthenticationToken,
        @RequestBody request: PaymentInvoiceCreateRequest,
    ): PaymentInvoiceCreatedResponse =
        paymentInvoiceFacade.createInvoice(authentication, request)

    @GetMapping("/payments/admin/invoices", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun listInvoices(authentication: JwtAuthenticationToken): List<PaymentInvoiceResponse> =
        paymentInvoiceFacade.listInvoices(authentication)

    @GetMapping("/payments/admin/invoices/{invoiceId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun adminInvoice(
        authentication: JwtAuthenticationToken,
        @PathVariable invoiceId: UUID,
    ): PaymentInvoiceDetailResponse =
        paymentInvoiceFacade.adminInvoice(authentication, invoiceId)

    @PostMapping("/payments/admin/invoices/{invoiceId}/cancel", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun cancelInvoice(
        authentication: JwtAuthenticationToken,
        @PathVariable invoiceId: UUID,
    ): PaymentInvoiceResponse =
        paymentInvoiceFacade.cancelInvoice(authentication, invoiceId)

    @GetMapping("/public/payment-invoices/{publicToken}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun publicInvoice(@PathVariable publicToken: String): PublicPaymentInvoiceResponse =
        paymentInvoiceFacade.publicInvoice(publicToken)

    @PostMapping("/public/payment-invoices/{publicToken}/checkout", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createPublicCheckout(@PathVariable publicToken: String): PublicPaymentCheckoutResponse =
        paymentInvoiceFacade.createPublicCheckout(publicToken)

    @PostMapping(
        "/payment-webhooks/yookassa",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun yookassaWebhook(@RequestBody rawBody: String): PaymentProviderEventResponse =
        paymentInvoiceFacade.processYooKassaWebhook(rawBody)
}
