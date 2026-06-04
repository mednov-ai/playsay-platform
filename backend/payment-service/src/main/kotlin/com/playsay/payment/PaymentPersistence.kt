package com.playsay.payment

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.security.SecureRandom
import java.time.Clock
import java.time.Instant
import java.util.Base64
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.transaction.annotation.Transactional

@Entity
@Table(name = "payment_invoices")
class PaymentInvoiceEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "number", nullable = false, unique = true)
    var number: String = "",

    @Column(name = "public_token_hash", nullable = false, unique = true, length = 64)
    var publicTokenHash: String = "",

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    var status: PaymentInvoiceStatus = PaymentInvoiceStatus.OPEN,

    @Column(name = "amount_minor", nullable = false)
    var amountMinor: Long = 0,

    @Column(name = "currency", nullable = false, length = 3)
    var currency: String = "RUB",

    @Column(name = "description", nullable = false)
    var description: String = "",

    @Column(name = "student_user_id")
    var studentUserId: UUID? = null,

    @Column(name = "payer_name")
    var payerName: String? = null,

    @Column(name = "payer_email")
    var payerEmail: String? = null,

    @Column(name = "payer_phone")
    var payerPhone: String? = null,

    @Column(name = "created_by_subject", nullable = false)
    var createdBySubject: String = "",

    @Column(name = "due_at")
    var dueAt: Instant? = null,

    @Column(name = "paid_at")
    var paidAt: Instant? = null,

    @Column(name = "canceled_at")
    var canceledAt: Instant? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "payment_attempts")
class PaymentAttemptEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "invoice_id", nullable = false)
    var invoiceId: UUID = UUID.randomUUID(),

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 32)
    var provider: PaymentProvider = PaymentProvider.YOOKASSA,

    @Column(name = "provider_payment_id")
    var providerPaymentId: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    var status: PaymentAttemptStatus = PaymentAttemptStatus.CREATED,

    @Column(name = "idempotence_key", nullable = false, unique = true)
    var idempotenceKey: String = "",

    @Column(name = "confirmation_url")
    var confirmationUrl: String? = null,

    @Column(name = "amount_minor", nullable = false)
    var amountMinor: Long = 0,

    @Column(name = "currency", nullable = false, length = 3)
    var currency: String = "RUB",

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "payment_provider_events")
class PaymentProviderEventEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 32)
    var provider: PaymentProvider = PaymentProvider.YOOKASSA,

    @Column(name = "event_type", nullable = false)
    var eventType: String = "",

    @Column(name = "provider_payment_id")
    var providerPaymentId: String? = null,

    @Column(name = "body_sha256", nullable = false, unique = true, length = 64)
    var bodySha256: String = "",

    @Column(name = "payload_summary_json", nullable = false, length = 2000)
    var payloadSummaryJson: String = "",

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    var status: PaymentProviderEventStatus = PaymentProviderEventStatus.IGNORED,

    @Column(name = "received_at", nullable = false)
    var receivedAt: Instant = Instant.EPOCH,

    @Column(name = "processed_at")
    var processedAt: Instant? = null,
)

interface PaymentInvoiceRepository : JpaRepository<PaymentInvoiceEntity, UUID> {
    fun findByPublicTokenHash(publicTokenHash: String): PaymentInvoiceEntity?
    fun findAllByOrderByCreatedAtDesc(): List<PaymentInvoiceEntity>
}

interface PaymentAttemptRepository : JpaRepository<PaymentAttemptEntity, UUID> {
    fun findByInvoiceIdOrderByCreatedAtAsc(invoiceId: UUID): List<PaymentAttemptEntity>
    fun findFirstByInvoiceIdAndStatusAndConfirmationUrlIsNotNullOrderByCreatedAtDesc(
        invoiceId: UUID,
        status: PaymentAttemptStatus,
    ): PaymentAttemptEntity?
}

interface PaymentProviderEventRepository : JpaRepository<PaymentProviderEventEntity, UUID> {
    fun findByBodySha256(bodySha256: String): PaymentProviderEventEntity?
}

open class PersistentPaymentInvoiceStore(
    private val provider: PaymentProviderClient,
    private val invoiceRepository: PaymentInvoiceRepository,
    private val attemptRepository: PaymentAttemptRepository,
    private val eventRepository: PaymentProviderEventRepository,
    private val clock: Clock,
    private val publicBaseUrl: String,
) : PaymentInvoiceOperations {
    private val objectMapper = jacksonObjectMapper()
    private val secureRandom = SecureRandom()

    @Transactional
    override fun createInvoice(command: CreatePaymentInvoiceCommand): CreatedPaymentInvoice {
        require(command.amountMinor > 0) { "amountMinor must be positive" }
        require(command.currency == "RUB") { "currency must be RUB" }
        val now = clock.instant()
        val token = randomToken()
        val invoice = PaymentInvoiceEntity(
            id = UUID.randomUUID(),
            number = paymentNumber(now),
            publicTokenHash = sha256Hex(token),
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
        return CreatedPaymentInvoice(invoice = invoiceRepository.save(invoice).toDomain(), publicUrlToken = token)
    }

    @Transactional(readOnly = true)
    override fun publicInvoice(publicToken: String): PaymentInvoice =
        invoiceByToken(publicToken).toDomain()

    @Transactional(readOnly = true)
    override fun adminInvoice(invoiceId: UUID): PaymentInvoiceDetail =
        PaymentInvoiceDetail(
            invoice = invoiceRepository.findById(invoiceId).orElseThrow { NoSuchElementException("Invoice not found") }.toDomain(),
            paymentAttempts = attemptRepository.findByInvoiceIdOrderByCreatedAtAsc(invoiceId).map { attempt -> attempt.toDomain() },
        )

    @Transactional(readOnly = true)
    override fun listInvoices(): List<PaymentInvoice> =
        invoiceRepository.findAllByOrderByCreatedAtDesc().map { invoice -> invoice.toDomain() }

    @Transactional
    override fun cancelInvoice(invoiceId: UUID): PaymentInvoice {
        val invoice = invoiceRepository.findById(invoiceId).orElseThrow { NoSuchElementException("Invoice not found") }
        if (invoice.status == PaymentInvoiceStatus.PAID) {
            return invoice.toDomain()
        }
        val now = clock.instant()
        invoice.status = PaymentInvoiceStatus.CANCELED
        invoice.canceledAt = now
        invoice.updatedAt = now
        return invoiceRepository.save(invoice).toDomain()
    }

    @Transactional
    override fun createCheckout(publicToken: String): PaymentCheckoutResult {
        val invoice = invoiceByToken(publicToken)
        if (invoice.status == PaymentInvoiceStatus.PAID || invoice.status == PaymentInvoiceStatus.CANCELED) {
            throw IllegalStateException("Invoice is not payable")
        }
        val existing = attemptRepository
            .findFirstByInvoiceIdAndStatusAndConfirmationUrlIsNotNullOrderByCreatedAtDesc(
                invoice.id,
                PaymentAttemptStatus.WAITING_FOR_CONFIRMATION,
            )
        if (existing?.confirmationUrl != null) {
            return PaymentCheckoutResult(
                invoiceId = invoice.id,
                paymentAttemptId = existing.id,
                confirmationUrl = existing.confirmationUrl.orEmpty(),
            )
        }

        val now = clock.instant()
        val attempt = attemptRepository.save(
            PaymentAttemptEntity(
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
            ),
        )

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

        attempt.providerPaymentId = result.providerPaymentId
        attempt.status = result.status
        attempt.confirmationUrl = result.confirmationUrl
        attempt.updatedAt = clock.instant()
        attemptRepository.save(attempt)

        invoice.status = PaymentInvoiceStatus.PAYMENT_PENDING
        invoice.updatedAt = clock.instant()
        invoiceRepository.save(invoice)
        return PaymentCheckoutResult(invoiceId = invoice.id, paymentAttemptId = attempt.id, confirmationUrl = result.confirmationUrl)
    }

    @Transactional
    override fun processYooKassaWebhook(rawBody: String): PaymentProviderEvent {
        val bodyHash = sha256Hex(rawBody)
        eventRepository.findByBodySha256(bodyHash)?.let { existing ->
            return existing.toDomain(statusOverride = PaymentProviderEventStatus.DUPLICATE)
        }

        val receivedAt = clock.instant()
        val json = objectMapper.readTree(rawBody)
        val eventType = json.path("event").asText("unknown")
        val paymentId = json.path("object").path("id").asText(null)
        val providerStatus = paymentId?.let { id -> provider.fetchPayment(id) }
        val status = if (providerStatus == null) {
            PaymentProviderEventStatus.IGNORED
        } else {
            applyProviderStatus(providerStatus)
        }
        val event = PaymentProviderEventEntity(
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
        return eventRepository.save(event).toDomain()
    }

    private fun applyProviderStatus(status: ProviderPaymentStatus): PaymentProviderEventStatus {
        val invoice = invoiceRepository.findById(status.invoiceId).orElse(null) ?: return PaymentProviderEventStatus.IGNORED
        val attempt = attemptRepository.findById(status.paymentAttemptId).orElse(null) ?: return PaymentProviderEventStatus.IGNORED
        if (attempt.invoiceId != invoice.id ||
            attempt.providerPaymentId != status.providerPaymentId ||
            attempt.amountMinor != status.amountMinor ||
            attempt.currency != status.currency
        ) {
            return PaymentProviderEventStatus.FAILED
        }

        attempt.status = status.status
        attempt.updatedAt = clock.instant()
        attemptRepository.save(attempt)
        if (status.status == PaymentAttemptStatus.SUCCEEDED) {
            invoice.status = PaymentInvoiceStatus.PAID
            invoice.paidAt = clock.instant()
            invoice.updatedAt = clock.instant()
            invoiceRepository.save(invoice)
        }
        if (status.status == PaymentAttemptStatus.CANCELED || status.status == PaymentAttemptStatus.FAILED) {
            invoice.status = PaymentInvoiceStatus.OPEN
            invoice.updatedAt = clock.instant()
            invoiceRepository.save(invoice)
        }
        return PaymentProviderEventStatus.PROCESSED
    }

    private fun invoiceByToken(publicToken: String): PaymentInvoiceEntity =
        invoiceRepository.findByPublicTokenHash(sha256Hex(publicToken)) ?: throw NoSuchElementException("Invoice not found")

    private fun paymentNumber(now: Instant): String =
        "PS-${now.toString().take(10).replace("-", "")}-${UUID.randomUUID().toString().take(8).uppercase()}"

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

private fun PaymentInvoiceEntity.toDomain(): PaymentInvoice =
    PaymentInvoice(
        id = id,
        number = number,
        publicTokenHash = publicTokenHash,
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

private fun PaymentAttemptEntity.toDomain(): PaymentAttempt =
    PaymentAttempt(
        id = id,
        invoiceId = invoiceId,
        provider = provider,
        providerPaymentId = providerPaymentId,
        status = status,
        idempotenceKey = idempotenceKey,
        confirmationUrl = confirmationUrl,
        amountMinor = amountMinor,
        currency = currency,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun PaymentProviderEventEntity.toDomain(statusOverride: PaymentProviderEventStatus? = null): PaymentProviderEvent =
    PaymentProviderEvent(
        id = id,
        provider = provider,
        eventType = eventType,
        providerPaymentId = providerPaymentId,
        bodySha256 = bodySha256,
        payloadSummaryJson = payloadSummaryJson,
        status = statusOverride ?: status,
        receivedAt = receivedAt,
        processedAt = processedAt,
    )
