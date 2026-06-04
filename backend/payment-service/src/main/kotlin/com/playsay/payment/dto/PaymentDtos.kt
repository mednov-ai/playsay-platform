package com.playsay.payment.dto

import com.playsay.payment.service.PaymentAttemptStatus
import com.playsay.payment.service.PaymentInvoiceStatus
import com.playsay.payment.service.PaymentProvider
import com.playsay.payment.service.PaymentProviderEventStatus
import java.time.Instant
import java.util.UUID

data class CreatePaymentInvoiceRequest(
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

data class CreatedPaymentInvoiceResponse(
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
    val status: PaymentInvoiceStatus,
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
    val provider: PaymentProvider,
    val providerPaymentId: String?,
    val status: PaymentAttemptStatus,
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

data class PaymentProviderEventResponse(
    val id: UUID,
    val provider: PaymentProvider,
    val eventType: String,
    val providerPaymentId: String?,
    val status: PaymentProviderEventStatus,
    val receivedAt: Instant,
    val processedAt: Instant?,
)
