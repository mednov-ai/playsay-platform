package com.playsay.payment.entity

import com.playsay.payment.service.PaymentAttemptStatus
import com.playsay.payment.service.PaymentInvoiceStatus
import com.playsay.payment.service.PaymentProvider
import com.playsay.payment.service.PaymentProviderEventStatus
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

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
