package com.playsay.payment.mapper

import com.playsay.payment.dto.CreatePaymentInvoiceRequest
import com.playsay.payment.dto.PaymentAttemptResponse
import com.playsay.payment.dto.PaymentCheckoutResponse
import com.playsay.payment.dto.PaymentInvoiceDetailResponse
import com.playsay.payment.dto.PaymentInvoiceResponse
import com.playsay.payment.dto.PaymentProviderEventResponse
import com.playsay.payment.service.CreatePaymentInvoiceCommand
import com.playsay.payment.service.PaymentAttempt
import com.playsay.payment.service.PaymentCheckoutResult
import com.playsay.payment.service.PaymentInvoice
import com.playsay.payment.service.PaymentInvoiceDetail
import com.playsay.payment.service.PaymentProviderEvent

fun CreatePaymentInvoiceRequest.toCommand(): CreatePaymentInvoiceCommand =
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

fun PaymentInvoice.toResponse(): PaymentInvoiceResponse =
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

fun PaymentInvoiceDetail.toResponse(): PaymentInvoiceDetailResponse =
    PaymentInvoiceDetailResponse(
        invoice = invoice.toResponse(),
        paymentAttempts = paymentAttempts.map { attempt -> attempt.toResponse() },
    )

fun PaymentAttempt.toResponse(): PaymentAttemptResponse =
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

fun PaymentCheckoutResult.toResponse(): PaymentCheckoutResponse =
    PaymentCheckoutResponse(
        invoiceId = invoiceId,
        paymentAttemptId = paymentAttemptId,
        confirmationUrl = confirmationUrl,
    )

fun PaymentProviderEvent.toResponse(): PaymentProviderEventResponse =
    PaymentProviderEventResponse(
        id = id,
        provider = provider,
        eventType = eventType,
        providerPaymentId = providerPaymentId,
        status = status,
        receivedAt = receivedAt,
        processedAt = processedAt,
    )
