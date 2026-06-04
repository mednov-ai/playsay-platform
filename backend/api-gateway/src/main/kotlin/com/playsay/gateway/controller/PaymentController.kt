package com.playsay.gateway.controller

import com.playsay.gateway.dto.PaymentInvoiceCreateRequest
import com.playsay.gateway.dto.PaymentInvoiceCreatedResponse
import com.playsay.gateway.dto.PaymentInvoiceDetailResponse
import com.playsay.gateway.dto.PaymentInvoiceResponse
import com.playsay.gateway.dto.PaymentProviderEventResponse
import com.playsay.gateway.dto.PublicPaymentCheckoutResponse
import com.playsay.gateway.dto.PublicPaymentInvoiceResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.InternalPaymentInvoiceCreatePayload
import com.playsay.gateway.service.PaymentServiceClient
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class PaymentController(
    private val paymentServiceClient: PaymentServiceClient,
) {
    @PostMapping(
        "/payments/admin/invoices",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun createInvoice(
        authentication: JwtAuthenticationToken,
        @RequestBody request: PaymentInvoiceCreateRequest,
    ): PaymentInvoiceCreatedResponse {
        requirePaymentManager(authentication)
        return paymentServiceClient.createInvoice(request.toInternal(authentication.name))
    }

    @GetMapping("/payments/admin/invoices", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun listInvoices(authentication: JwtAuthenticationToken): List<PaymentInvoiceResponse> {
        requirePaymentManager(authentication)
        return paymentServiceClient.listInvoices()
    }

    @GetMapping("/payments/admin/invoices/{invoiceId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun adminInvoice(
        authentication: JwtAuthenticationToken,
        @PathVariable invoiceId: UUID,
    ): PaymentInvoiceDetailResponse {
        requirePaymentManager(authentication)
        return paymentServiceClient.adminInvoice(invoiceId)
    }

    @PostMapping("/payments/admin/invoices/{invoiceId}/cancel", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun cancelInvoice(
        authentication: JwtAuthenticationToken,
        @PathVariable invoiceId: UUID,
    ): PaymentInvoiceResponse {
        requirePaymentManager(authentication)
        return paymentServiceClient.cancelInvoice(invoiceId)
    }

    @GetMapping("/public/payment-invoices/{publicToken}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun publicInvoice(@PathVariable publicToken: String): PublicPaymentInvoiceResponse =
        paymentServiceClient.publicInvoice(publicToken).toPublicResponse()

    @PostMapping("/public/payment-invoices/{publicToken}/checkout", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createPublicCheckout(@PathVariable publicToken: String): PublicPaymentCheckoutResponse =
        PublicPaymentCheckoutResponse(confirmationUrl = paymentServiceClient.createCheckout(publicToken).confirmationUrl)

    @PostMapping(
        "/payment-webhooks/yookassa",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    fun yookassaWebhook(@RequestBody rawBody: String): PaymentProviderEventResponse =
        paymentServiceClient.processYooKassaWebhook(rawBody)

    private fun PaymentInvoiceCreateRequest.toInternal(createdBySubject: String): InternalPaymentInvoiceCreatePayload =
        InternalPaymentInvoiceCreatePayload(
            amountMinor = amountMinor,
            currency = currency,
            description = description,
            createdBySubject = createdBySubject,
            studentUserId = studentUserId,
            payerName = payerName,
            payerEmail = payerEmail,
            payerPhone = payerPhone,
            dueAt = dueAt,
        )

    private fun requirePaymentManager(authentication: JwtAuthenticationToken) {
        val authorities = authentication.authorities.map { authority -> authority.authority }.toSet()
        if (MetaData.Authorities.ADMIN !in authorities && MetaData.Authorities.TEACHER !in authorities) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.PAYMENT_ADMIN_ROLE_REQUIRED)
        }
    }

    private fun PaymentInvoiceResponse.toPublicResponse(): PublicPaymentInvoiceResponse =
        PublicPaymentInvoiceResponse(
            number = number,
            status = status,
            amountMinor = amountMinor,
            currency = currency,
            description = description,
            payerName = payerName,
            dueAt = dueAt,
            paidAt = paidAt,
            canceledAt = canceledAt,
        )
}
