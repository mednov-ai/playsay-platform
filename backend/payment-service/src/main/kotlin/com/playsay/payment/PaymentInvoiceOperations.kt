package com.playsay.payment

import java.util.UUID

interface PaymentInvoiceOperations {
    fun createInvoice(command: CreatePaymentInvoiceCommand): CreatedPaymentInvoice
    fun publicInvoice(publicToken: String): PaymentInvoice
    fun adminInvoice(invoiceId: UUID): PaymentInvoiceDetail
    fun listInvoices(): List<PaymentInvoice>
    fun cancelInvoice(invoiceId: UUID): PaymentInvoice
    fun createCheckout(publicToken: String): PaymentCheckoutResult
    fun processYooKassaWebhook(rawBody: String): PaymentProviderEvent
}
