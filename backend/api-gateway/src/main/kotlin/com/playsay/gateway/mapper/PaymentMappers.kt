package com.playsay.gateway.mapper

import com.playsay.gateway.dto.PaymentInvoiceCreateRequest
import com.playsay.gateway.dto.PaymentInvoiceResponse
import com.playsay.gateway.dto.PublicPaymentInvoiceResponse
import com.playsay.gateway.service.InternalPaymentInvoiceCreatePayload

fun PaymentInvoiceCreateRequest.toInternal(createdBySubject: String): InternalPaymentInvoiceCreatePayload =
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

fun PaymentInvoiceResponse.toPublicResponse(): PublicPaymentInvoiceResponse =
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
