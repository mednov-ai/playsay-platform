package com.playsay.payment

import java.time.Instant
import java.util.UUID

enum class PaymentInvoiceStatus {
    OPEN,
    PAYMENT_PENDING,
    PAID,
    EXPIRED,
    CANCELED,
    REFUNDED,
}

enum class PaymentAttemptStatus {
    CREATED,
    WAITING_FOR_CONFIRMATION,
    SUCCEEDED,
    CANCELED,
    FAILED,
}

enum class PaymentProvider {
    YOOKASSA,
    ROBOKASSA,
}

enum class PaymentProviderEventStatus {
    PROCESSED,
    DUPLICATE,
    IGNORED,
    FAILED,
}

data class CreatePaymentInvoiceCommand(
    val amountMinor: Long,
    val currency: String,
    val description: String,
    val createdBySubject: String,
    val dueAt: Instant?,
    val studentUserId: UUID?,
    val payerName: String?,
    val payerEmail: String?,
    val payerPhone: String?,
)

data class PaymentInvoice(
    val id: UUID,
    val number: String,
    val publicTokenHash: String,
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

data class PaymentAttempt(
    val id: UUID,
    val invoiceId: UUID,
    val provider: PaymentProvider,
    val providerPaymentId: String?,
    val status: PaymentAttemptStatus,
    val idempotenceKey: String,
    val confirmationUrl: String?,
    val amountMinor: Long,
    val currency: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class PaymentProviderEvent(
    val id: UUID,
    val provider: PaymentProvider,
    val eventType: String,
    val providerPaymentId: String?,
    val bodySha256: String,
    val payloadSummaryJson: String,
    val status: PaymentProviderEventStatus,
    val receivedAt: Instant,
    val processedAt: Instant?,
)

data class CreatedPaymentInvoice(
    val invoice: PaymentInvoice,
    val publicUrlToken: String,
)

data class PaymentInvoiceDetail(
    val invoice: PaymentInvoice,
    val paymentAttempts: List<PaymentAttempt>,
)

data class PaymentCheckoutResult(
    val invoiceId: UUID,
    val paymentAttemptId: UUID,
    val confirmationUrl: String,
)

data class ProviderPaymentCreateCommand(
    val invoiceId: UUID,
    val amountMinor: Long,
    val currency: String,
    val description: String,
    val returnUrl: String,
    val idempotenceKey: String,
    val metadata: Map<String, String>,
)

data class ProviderPaymentCreateResult(
    val providerPaymentId: String,
    val confirmationUrl: String,
    val status: PaymentAttemptStatus,
)

data class ProviderPaymentStatus(
    val providerPaymentId: String,
    val status: PaymentAttemptStatus,
    val amountMinor: Long,
    val currency: String,
    val invoiceId: UUID,
    val paymentAttemptId: UUID,
)

interface PaymentProviderClient {
    fun createPayment(command: ProviderPaymentCreateCommand): ProviderPaymentCreateResult
    fun fetchPayment(providerPaymentId: String): ProviderPaymentStatus
}
