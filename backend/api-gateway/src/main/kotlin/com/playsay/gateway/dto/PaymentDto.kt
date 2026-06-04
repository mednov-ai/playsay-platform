package com.playsay.gateway.dto

import java.time.Instant
import java.util.UUID

data class PaymentInvoiceCreateRequest(
    val amountMinor: Long,
    val currency: String = "RUB",
    val description: String,
    val studentUserId: UUID?,
    val payerName: String?,
    val payerEmail: String?,
    val payerPhone: String?,
    val dueAt: Instant?,
)

data class PaymentInvoiceCreatedResponse(
    val invoice: PaymentInvoiceResponse,
    val publicUrlToken: String,
)

data class PaymentInvoiceDetailResponse(
    val invoice: PaymentInvoiceResponse,
    val paymentAttempts: List<PaymentAttemptResponse>,
)

data class PaymentInvoiceResponse(
    val id: UUID,
    val number: String,
    val status: String,
    val amountMinor: Long,
    val currency: String,
    val description: String,
    val studentUserId: UUID?,
    val payerName: String?,
    val payerEmail: String?,
    val payerPhone: String?,
    val createdBySubject: String,
    val dueAt: Instant?,
    val paidAt: Instant?,
    val canceledAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class PaymentAttemptResponse(
    val id: UUID,
    val invoiceId: UUID,
    val provider: String,
    val providerPaymentId: String?,
    val status: String,
    val confirmationUrl: String?,
    val amountMinor: Long,
    val currency: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class PaymentCheckoutResponse(
    val invoiceId: UUID,
    val paymentAttemptId: UUID,
    val confirmationUrl: String,
)

data class PublicPaymentInvoiceResponse(
    val number: String,
    val status: String,
    val amountMinor: Long,
    val currency: String,
    val description: String,
    val payerName: String?,
    val dueAt: Instant?,
    val paidAt: Instant?,
    val canceledAt: Instant?,
)

data class PublicPaymentCheckoutResponse(
    val confirmationUrl: String,
)

data class PaymentProviderEventResponse(
    val id: UUID,
    val provider: String,
    val eventType: String,
    val providerPaymentId: String?,
    val status: String,
    val receivedAt: Instant,
    val processedAt: Instant?,
)
