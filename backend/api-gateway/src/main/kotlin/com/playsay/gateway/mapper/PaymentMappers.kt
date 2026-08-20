package com.playsay.gateway.mapper

import com.playsay.contract.payment.model.CreatePaymentInvoiceRequest as ContractCreatePaymentInvoiceRequest
import com.playsay.contract.payment.model.CreatedPaymentInvoiceResponse as ContractCreatedPaymentInvoiceResponse
import com.playsay.contract.payment.model.PaymentAttemptResponse as ContractPaymentAttemptResponse
import com.playsay.contract.payment.model.PaymentInvoiceDetailResponse as ContractPaymentInvoiceDetailResponse
import com.playsay.contract.payment.model.PaymentInvoiceResponse as ContractPaymentInvoiceResponse
import com.playsay.contract.payment.model.PaymentProviderEventResponse as ContractPaymentProviderEventResponse
import com.playsay.gateway.dto.PaymentAttemptResponse
import com.playsay.gateway.dto.PaymentInvoiceCreateRequest
import com.playsay.gateway.dto.PaymentInvoiceCreatedResponse
import com.playsay.gateway.dto.PaymentInvoiceDetailResponse
import com.playsay.gateway.dto.PaymentInvoiceResponse
import com.playsay.gateway.dto.PaymentProviderEventResponse
import com.playsay.gateway.dto.PublicPaymentInvoiceResponse

fun PaymentInvoiceCreateRequest.toInternal(createdBySubject: String): ContractCreatePaymentInvoiceRequest =
    ContractCreatePaymentInvoiceRequest(
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

fun ContractCreatedPaymentInvoiceResponse.toFacade(): PaymentInvoiceCreatedResponse =
    PaymentInvoiceCreatedResponse(invoice.toFacade(), publicUrlToken)

fun ContractPaymentInvoiceDetailResponse.toFacade(): PaymentInvoiceDetailResponse =
    PaymentInvoiceDetailResponse(invoice.toFacade(), paymentAttempts.map(ContractPaymentAttemptResponse::toFacade))

fun ContractPaymentInvoiceResponse.toFacade(): PaymentInvoiceResponse =
    PaymentInvoiceResponse(
        id = id,
        number = number,
        status = status.value,
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

private fun ContractPaymentAttemptResponse.toFacade(): PaymentAttemptResponse =
    PaymentAttemptResponse(
        id = id,
        invoiceId = invoiceId,
        provider = provider.value,
        providerPaymentId = providerPaymentId,
        status = status.value,
        confirmationUrl = confirmationUrl,
        amountMinor = amountMinor,
        currency = currency,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

fun ContractPaymentProviderEventResponse.toFacade(): PaymentProviderEventResponse =
    PaymentProviderEventResponse(
        id = id,
        provider = provider.value,
        eventType = eventType,
        providerPaymentId = providerPaymentId,
        status = status.value,
        receivedAt = receivedAt,
        processedAt = processedAt,
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
