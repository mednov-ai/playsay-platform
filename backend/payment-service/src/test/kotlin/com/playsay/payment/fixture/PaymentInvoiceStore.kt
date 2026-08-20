package com.playsay.payment.fixture

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.payment.service.CreatePaymentInvoiceCommand
import com.playsay.payment.service.CreatedPaymentInvoice
import com.playsay.payment.service.PaymentAttempt
import com.playsay.payment.service.PaymentAttemptStatus
import com.playsay.payment.service.PaymentCheckoutResult
import com.playsay.payment.service.PaymentInvoice
import com.playsay.payment.service.PaymentInvoiceDetail
import com.playsay.payment.service.PaymentInvoiceOperations
import com.playsay.payment.service.PaymentInvoiceStatus
import com.playsay.payment.service.PaymentProvider
import com.playsay.payment.service.PaymentProviderClient
import com.playsay.payment.service.PaymentProviderEvent
import com.playsay.payment.service.PaymentProviderEventStatus
import com.playsay.payment.service.ProviderPaymentCreateCommand
import com.playsay.payment.service.ProviderPaymentStatus
import com.playsay.payment.utils.sha256Hex
import java.security.SecureRandom
import java.time.Clock
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

class PaymentInvoiceStore(
    private val provider: PaymentProviderClient,
    private val clock: Clock = Clock.systemUTC(),
    private val publicBaseUrl: String = "https://online.play-and-say.ru",
) : PaymentInvoiceOperations {
    private val objectMapper = jacksonObjectMapper()
    private val secureRandom = SecureRandom()
    private val invoiceSequence = AtomicLong(1)
    private val invoices = ConcurrentHashMap<UUID, PaymentInvoice>()
    private val tokenHashes = ConcurrentHashMap<String, UUID>()
    private val attempts = ConcurrentHashMap<UUID, PaymentAttempt>()
    private val eventHashes = ConcurrentHashMap<String, PaymentProviderEvent>()

    override fun createInvoice(command: CreatePaymentInvoiceCommand): CreatedPaymentInvoice {
        require(command.amountMinor > 0) { "amountMinor must be positive" }
        require(command.currency == "RUB") { "currency must be RUB" }
        val now = clock.instant()
        val token = randomToken()
        val tokenHash = sha256Hex(token)
        val invoice = PaymentInvoice(
            id = UUID.randomUUID(),
            number = "PS-${now.toString().take(10).replace("-", "")}-${invoiceSequence.getAndIncrement().toString().padStart(5, '0')}",
            publicTokenHash = tokenHash,
            status = PaymentInvoiceStatus.OPEN,
            amountMinor = command.amountMinor,
            currency = command.currency,
            description = command.description.trim(),
            studentUserId = command.studentUserId,
            payerName = command.payerName?.trim()?.ifEmpty { null },
            payerEmail = command.payerEmail?.trim()?.ifEmpty { null },
            payerPhone = command.payerPhone?.trim()?.ifEmpty { null },
            createdBySubject = command.createdBySubject.trim(),
            dueAt = command.dueAt,
            paidAt = null,
            canceledAt = null,
            createdAt = now,
            updatedAt = now,
        )
        invoices[invoice.id] = invoice
        tokenHashes[tokenHash] = invoice.id
        return CreatedPaymentInvoice(invoice = invoice, publicUrlToken = token)
    }

    override fun publicInvoice(publicToken: String): PaymentInvoice =
        invoiceByToken(publicToken)

    override fun adminInvoice(invoiceId: UUID): PaymentInvoiceDetail =
        PaymentInvoiceDetail(
            invoice = invoices[invoiceId] ?: throw NoSuchElementException("Invoice not found"),
            paymentAttempts = attempts.values.filter { attempt -> attempt.invoiceId == invoiceId }.sortedBy { it.createdAt },
        )

    override fun listInvoices(): List<PaymentInvoice> =
        invoices.values.sortedByDescending { invoice -> invoice.createdAt }

    override fun cancelInvoice(invoiceId: UUID): PaymentInvoice {
        val invoice = invoices[invoiceId] ?: throw NoSuchElementException("Invoice not found")
        if (invoice.status == PaymentInvoiceStatus.PAID) {
            return invoice
        }
        val updated = invoice.copy(
            status = PaymentInvoiceStatus.CANCELED,
            canceledAt = clock.instant(),
            updatedAt = clock.instant(),
        )
        invoices[invoiceId] = updated
        return updated
    }

    override fun createCheckout(publicToken: String): PaymentCheckoutResult {
        val invoice = invoiceByToken(publicToken)
        if (invoice.status == PaymentInvoiceStatus.PAID || invoice.status == PaymentInvoiceStatus.CANCELED) {
            throw IllegalStateException("Invoice is not payable")
        }

        val existing = attempts.values
            .filter { attempt -> attempt.invoiceId == invoice.id }
            .firstOrNull { attempt -> attempt.status == PaymentAttemptStatus.WAITING_FOR_CONFIRMATION && attempt.confirmationUrl != null }
        if (existing != null) {
            return PaymentCheckoutResult(
                invoiceId = invoice.id,
                paymentAttemptId = existing.id,
                confirmationUrl = existing.confirmationUrl.orEmpty(),
            )
        }

        val now = clock.instant()
        val attempt = PaymentAttempt(
            id = UUID.randomUUID(),
            invoiceId = invoice.id,
            provider = PaymentProvider.YOOKASSA,
            providerPaymentId = null,
            status = PaymentAttemptStatus.CREATED,
            idempotenceKey = UUID.randomUUID().toString(),
            confirmationUrl = null,
            amountMinor = invoice.amountMinor,
            currency = invoice.currency,
            createdAt = now,
            updatedAt = now,
        )
        attempts[attempt.id] = attempt

        val result = provider.createPayment(
            ProviderPaymentCreateCommand(
                invoiceId = invoice.id,
                amountMinor = invoice.amountMinor,
                currency = invoice.currency,
                description = invoice.description,
                returnUrl = "$publicBaseUrl/pay/$publicToken",
                idempotenceKey = attempt.idempotenceKey,
                metadata = mapOf(
                    "invoiceId" to invoice.id.toString(),
                    "paymentAttemptId" to attempt.id.toString(),
                ),
            ),
        )

        attempts[attempt.id] = attempt.copy(
            providerPaymentId = result.providerPaymentId,
            status = result.status,
            confirmationUrl = result.confirmationUrl,
            updatedAt = clock.instant(),
        )
        invoices[invoice.id] = invoice.copy(
            status = PaymentInvoiceStatus.PAYMENT_PENDING,
            updatedAt = clock.instant(),
        )
        return PaymentCheckoutResult(invoiceId = invoice.id, paymentAttemptId = attempt.id, confirmationUrl = result.confirmationUrl)
    }

    override fun processYooKassaWebhook(rawBody: String): PaymentProviderEvent {
        val bodyHash = sha256Hex(rawBody)
        eventHashes[bodyHash]?.let { existing -> return existing.copy(status = PaymentProviderEventStatus.DUPLICATE) }

        val receivedAt = clock.instant()
        val json = objectMapper.readTree(rawBody)
        val eventType = json.path("event").asText("unknown")
        val paymentId = json.path("object").path("id").asText(null)
        val providerStatus = paymentId?.let { provider.fetchPayment(it) }
        val status = if (providerStatus == null) {
            PaymentProviderEventStatus.IGNORED
        } else {
            applyProviderStatus(providerStatus)
        }
        val event = PaymentProviderEvent(
            id = UUID.randomUUID(),
            provider = PaymentProvider.YOOKASSA,
            eventType = eventType,
            providerPaymentId = paymentId,
            bodySha256 = bodyHash,
            payloadSummaryJson = payloadSummary(json),
            status = status,
            receivedAt = receivedAt,
            processedAt = clock.instant(),
        )
        eventHashes[bodyHash] = event
        return event
    }

    private fun applyProviderStatus(status: ProviderPaymentStatus): PaymentProviderEventStatus {
        val invoice = invoices[status.invoiceId] ?: return PaymentProviderEventStatus.IGNORED
        val attempt = attempts[status.paymentAttemptId] ?: return PaymentProviderEventStatus.IGNORED
        if (attempt.invoiceId != invoice.id ||
            attempt.providerPaymentId != status.providerPaymentId ||
            attempt.amountMinor != status.amountMinor ||
            attempt.currency != status.currency
        ) {
            return PaymentProviderEventStatus.FAILED
        }

        attempts[attempt.id] = attempt.copy(status = status.status, updatedAt = clock.instant())
        if (status.status == PaymentAttemptStatus.SUCCEEDED) {
            invoices[invoice.id] = invoice.copy(
                status = PaymentInvoiceStatus.PAID,
                paidAt = clock.instant(),
                updatedAt = clock.instant(),
            )
        }
        if (status.status == PaymentAttemptStatus.CANCELED || status.status == PaymentAttemptStatus.FAILED) {
            invoices[invoice.id] = invoice.copy(
                status = PaymentInvoiceStatus.OPEN,
                updatedAt = clock.instant(),
            )
        }
        return PaymentProviderEventStatus.PROCESSED
    }

    private fun invoiceByToken(publicToken: String): PaymentInvoice {
        val tokenHash = sha256Hex(publicToken)
        val invoiceId = tokenHashes[tokenHash] ?: throw NoSuchElementException("Invoice not found")
        return invoices[invoiceId] ?: throw NoSuchElementException("Invoice not found")
    }

    private fun randomToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun payloadSummary(json: JsonNode): String {
        val objectNode = objectMapper.createObjectNode()
        objectNode.put("event", json.path("event").asText(""))
        objectNode.put("providerPaymentId", json.path("object").path("id").asText(""))
        objectNode.put("status", json.path("object").path("status").asText(""))
        return objectMapper.writeValueAsString(objectNode)
    }
}
