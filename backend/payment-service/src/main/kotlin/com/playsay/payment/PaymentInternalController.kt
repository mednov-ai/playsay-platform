package com.playsay.payment

import java.time.Instant
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
        @RequestBody rawBody: String,
    ): PaymentProviderEventResponse {
        requireServiceToken(token)
        return store.processYooKassaWebhook(rawBody).toResponse()
    }

    private fun requireServiceToken(token: String?) {
        if (serviceToken.isBlank() || token != serviceToken) {
            throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        }
    }
}

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
) {
    fun toCommand(): CreatePaymentInvoiceCommand =
        CreatePaymentInvoiceCommand(
            amountMinor = amountMinor,
            currency = currency,
            description = description,
            createdBySubject = createdBySubject,
            dueAt = dueAt,
            studentUserId = studentUserId,
            payerName = payerName,
            payerEmail = payerEmail,
            payerPhone = payerPhone,
        )
}

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

private fun PaymentInvoice.toResponse(): PaymentInvoiceResponse =
    PaymentInvoiceResponse(
        id = id,
        number = number,
        status = status,
        amountMinor = amountMinor,
        currency = currency,
        description = description,
        studentUserId = studentUserId,
        payerName = payerName,
        payerEmail = payerEmail,
        payerPhone = payerPhone,
        createdBySubject = createdBySubject,
        dueAt = dueAt,
        paidAt = paidAt,
        canceledAt = canceledAt,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun PaymentInvoiceDetail.toResponse(): PaymentInvoiceDetailResponse =
    PaymentInvoiceDetailResponse(
        invoice = invoice.toResponse(),
        paymentAttempts = paymentAttempts.map { attempt -> attempt.toResponse() },
    )

private fun PaymentAttempt.toResponse(): PaymentAttemptResponse =
    PaymentAttemptResponse(
        id = id,
        invoiceId = invoiceId,
        provider = provider,
        providerPaymentId = providerPaymentId,
        status = status,
        confirmationUrl = confirmationUrl,
        amountMinor = amountMinor,
        currency = currency,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun PaymentCheckoutResult.toResponse(): PaymentCheckoutResponse =
    PaymentCheckoutResponse(
        invoiceId = invoiceId,
        paymentAttemptId = paymentAttemptId,
        confirmationUrl = confirmationUrl,
    )

private fun PaymentProviderEvent.toResponse(): PaymentProviderEventResponse =
    PaymentProviderEventResponse(
        id = id,
        provider = provider,
        eventType = eventType,
        providerPaymentId = providerPaymentId,
        status = status,
        receivedAt = receivedAt,
        processedAt = processedAt,
    )
