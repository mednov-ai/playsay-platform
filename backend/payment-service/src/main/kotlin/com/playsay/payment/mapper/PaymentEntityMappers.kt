package com.playsay.payment.mapper

import com.playsay.payment.entity.PaymentAttemptEntity
import com.playsay.payment.entity.PaymentInvoiceEntity
import com.playsay.payment.entity.PaymentProviderEventEntity
import com.playsay.payment.service.PaymentAttempt
import com.playsay.payment.service.PaymentInvoice
import com.playsay.payment.service.PaymentProviderEvent
import com.playsay.payment.service.PaymentProviderEventStatus

fun PaymentInvoiceEntity.toDomain(): PaymentInvoice =
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

fun PaymentAttemptEntity.toDomain(): PaymentAttempt =
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

fun PaymentProviderEventEntity.toDomain(statusOverride: PaymentProviderEventStatus? = null): PaymentProviderEvent =
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
