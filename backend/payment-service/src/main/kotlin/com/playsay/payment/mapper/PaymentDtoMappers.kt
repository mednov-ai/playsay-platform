package com.playsay.payment.mapper

import com.playsay.contract.payment.model.CreatePaymentInvoiceRequest
import com.playsay.contract.payment.model.PaymentAttemptResponse
import com.playsay.contract.payment.model.PaymentAttemptStatus as ContractPaymentAttemptStatus
import com.playsay.contract.payment.model.PaymentCheckoutResponse
import com.playsay.contract.payment.model.PaymentInvoiceDetailResponse
import com.playsay.contract.payment.model.PaymentInvoiceResponse
import com.playsay.contract.payment.model.PaymentInvoiceStatus as ContractPaymentInvoiceStatus
import com.playsay.contract.payment.model.PaymentProvider as ContractPaymentProvider
import com.playsay.contract.payment.model.PaymentProviderEventResponse
import com.playsay.contract.payment.model.PaymentProviderEventStatus as ContractPaymentProviderEventStatus
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
        status = ContractPaymentInvoiceStatus.valueOf(status.name),
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
        provider = ContractPaymentProvider.valueOf(provider.name),
        providerPaymentId = providerPaymentId,
        status = ContractPaymentAttemptStatus.valueOf(status.name),
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
        provider = ContractPaymentProvider.valueOf(provider.name),
        eventType = eventType,
        providerPaymentId = providerPaymentId,
        status = ContractPaymentProviderEventStatus.valueOf(status.name),
        receivedAt = receivedAt,
        processedAt = processedAt,
    )
