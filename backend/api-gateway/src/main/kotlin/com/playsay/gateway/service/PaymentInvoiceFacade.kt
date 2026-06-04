package com.playsay.gateway.service

import com.playsay.gateway.dto.PaymentInvoiceCreateRequest
import com.playsay.gateway.dto.PaymentInvoiceCreatedResponse
import com.playsay.gateway.dto.PaymentInvoiceDetailResponse
import com.playsay.gateway.dto.PaymentInvoiceResponse
import com.playsay.gateway.dto.PaymentProviderEventResponse
import com.playsay.gateway.dto.PublicPaymentCheckoutResponse
import com.playsay.gateway.dto.PublicPaymentInvoiceResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.mapper.toInternal
import com.playsay.gateway.mapper.toPublicResponse
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

@Component
class PaymentInvoiceFacade(
    private val paymentServiceClient: PaymentServiceClient,
) {
    fun createInvoice(
        authentication: JwtAuthenticationToken,
        request: PaymentInvoiceCreateRequest,
    ): PaymentInvoiceCreatedResponse {
        requirePaymentManager(authentication)
        return paymentServiceClient.createInvoice(request.toInternal(authentication.name))
    }

    fun listInvoices(authentication: JwtAuthenticationToken): List<PaymentInvoiceResponse> {
        requirePaymentManager(authentication)
        return paymentServiceClient.listInvoices()
    }

    fun adminInvoice(
        authentication: JwtAuthenticationToken,
        invoiceId: UUID,
    ): PaymentInvoiceDetailResponse {
        requirePaymentManager(authentication)
        return paymentServiceClient.adminInvoice(invoiceId)
    }

    fun cancelInvoice(
        authentication: JwtAuthenticationToken,
        invoiceId: UUID,
    ): PaymentInvoiceResponse {
        requirePaymentManager(authentication)
        return paymentServiceClient.cancelInvoice(invoiceId)
    }

    fun publicInvoice(publicToken: String): PublicPaymentInvoiceResponse =
        paymentServiceClient.publicInvoice(publicToken).toPublicResponse()

    fun createPublicCheckout(publicToken: String): PublicPaymentCheckoutResponse =
        PublicPaymentCheckoutResponse(confirmationUrl = paymentServiceClient.createCheckout(publicToken).confirmationUrl)

    fun processYooKassaWebhook(rawBody: String): PaymentProviderEventResponse =
        paymentServiceClient.processYooKassaWebhook(rawBody)

    private fun requirePaymentManager(authentication: JwtAuthenticationToken) {
        val authorities = authentication.authorities.map { authority -> authority.authority }.toSet()
        if (MetaData.Authorities.ADMIN !in authorities && MetaData.Authorities.TEACHER !in authorities) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.PAYMENT_ADMIN_ROLE_REQUIRED)
        }
    }
}
