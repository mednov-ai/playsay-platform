package com.playsay.payment.fixture

import com.playsay.payment.service.CreatePaymentInvoiceCommand
import com.playsay.payment.service.PaymentAttemptStatus
import com.playsay.payment.service.PaymentInvoiceOperations
import com.playsay.payment.service.PaymentInvoiceStatus
import com.playsay.payment.service.PaymentProviderClient
import com.playsay.payment.service.PaymentProviderEventStatus
import com.playsay.payment.service.ProviderPaymentCreateCommand
import com.playsay.payment.service.ProviderPaymentCreateResult
import com.playsay.payment.service.ProviderPaymentStatus
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

abstract class PaymentInvoiceOperationsBehavior {
    protected abstract fun operations(): PaymentInvoiceOperations
    protected abstract fun provider(): RecordingPaymentProviderClient

    @Test
    fun `invoice checkout and verified webhook obey the common operations contract`() {
        val operations = operations()
        val created = operations.createInvoice(createCommand())
        assertEquals(PaymentInvoiceStatus.OPEN, created.invoice.status)
        assertTrue(created.publicUrlToken.length >= 32)
        assertNotEquals(created.publicUrlToken, created.invoice.publicTokenHash)
        assertEquals(created.invoice.id, operations.publicInvoice(created.publicUrlToken).id)
        assertEquals(listOf(created.invoice.id), operations.listInvoices().map { it.id })

        val checkout = operations.createCheckout(created.publicUrlToken)
        val repeatedCheckout = operations.createCheckout(created.publicUrlToken)
        assertEquals(checkout, repeatedCheckout)
        assertEquals("https://checkout.test/pay-1", checkout.confirmationUrl)
        assertEquals(PaymentInvoiceStatus.PAYMENT_PENDING, operations.publicInvoice(created.publicUrlToken).status)
        assertEquals(created.invoice.id, provider().created.single().invoiceId)
        assertNotNull(provider().created.single().idempotenceKey)

        val event = webhook(created.invoice.id, checkout.paymentAttemptId)
        assertEquals(PaymentProviderEventStatus.PROCESSED, operations.processYooKassaWebhook(event).status)
        assertEquals(PaymentProviderEventStatus.DUPLICATE, operations.processYooKassaWebhook(event).status)
        assertEquals(PaymentInvoiceStatus.PAID, operations.publicInvoice(created.publicUrlToken).status)
        assertEquals(PaymentAttemptStatus.SUCCEEDED, operations.adminInvoice(created.invoice.id).paymentAttempts.single().status)
        assertEquals(PaymentInvoiceStatus.PAID, operations.cancelInvoice(created.invoice.id).status)
    }

    private fun createCommand() = CreatePaymentInvoiceCommand(
        amountMinor = 3_500_00,
        currency = "RUB",
        description = " Honey School lesson package ",
        createdBySubject = "teacher-1",
        dueAt = null,
        studentUserId = null,
        payerName = " Parent ",
        payerEmail = " parent@example.com ",
        payerPhone = null,
    )

    private fun webhook(invoiceId: UUID, paymentAttemptId: UUID): String =
        """{"type":"notification","event":"payment.succeeded","object":{"id":"pay-1","status":"succeeded","amount":{"value":"3500.00","currency":"RUB"},"metadata":{"invoiceId":"$invoiceId","paymentAttemptId":"$paymentAttemptId"}}}"""
}

class RecordingPaymentProviderClient : PaymentProviderClient {
    val created = mutableListOf<ProviderPaymentCreateCommand>()

    fun reset() = created.clear()

    override fun createPayment(command: ProviderPaymentCreateCommand): ProviderPaymentCreateResult {
        created += command
        return ProviderPaymentCreateResult(
            providerPaymentId = "pay-${created.size}",
            confirmationUrl = "https://checkout.test/pay-${created.size}",
            status = PaymentAttemptStatus.WAITING_FOR_CONFIRMATION,
        )
    }

    override fun fetchPayment(providerPaymentId: String): ProviderPaymentStatus {
        val command = created.single()
        return ProviderPaymentStatus(
            providerPaymentId = providerPaymentId,
            status = PaymentAttemptStatus.SUCCEEDED,
            amountMinor = command.amountMinor,
            currency = command.currency,
            invoiceId = command.invoiceId,
            paymentAttemptId = UUID.fromString(command.metadata.getValue("paymentAttemptId")),
        )
    }
}
