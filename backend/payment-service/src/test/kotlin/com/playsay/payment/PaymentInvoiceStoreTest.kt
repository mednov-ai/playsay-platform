package com.playsay.payment

import com.playsay.payment.service.CreatePaymentInvoiceCommand
import com.playsay.payment.service.PaymentAttemptStatus
import com.playsay.payment.service.PaymentInvoiceStatus
import com.playsay.payment.service.PaymentInvoiceStore
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

class PaymentInvoiceStoreTest {
    @Test
    fun `checkout creates provider payment and verified webhook marks invoice paid`() {
        val provider = RecordingPaymentProviderClient()
        val store = PaymentInvoiceStore(provider = provider)

        val created = store.createInvoice(
            CreatePaymentInvoiceCommand(
                amountMinor = 3_500_00,
                currency = "RUB",
                description = "Honey School lesson package",
                createdBySubject = "teacher-1",
                dueAt = null,
                studentUserId = null,
                payerName = "Parent",
                payerEmail = "parent@example.com",
                payerPhone = null,
            ),
        )

        assertEquals(PaymentInvoiceStatus.OPEN, created.invoice.status)
        assertTrue(created.publicUrlToken.length >= 32)
        assertNotEquals(created.publicUrlToken, created.invoice.publicTokenHash)

        val checkout = store.createCheckout(created.publicUrlToken)

        assertEquals("https://checkout.test/pay-1", checkout.confirmationUrl)
        assertEquals(PaymentInvoiceStatus.PAYMENT_PENDING, store.publicInvoice(created.publicUrlToken).status)
        assertEquals(created.invoice.id, provider.created.single().invoiceId)
        assertNotNull(provider.created.single().idempotenceKey)

        val event = """
            {
              "type": "notification",
              "event": "payment.succeeded",
              "object": {
                "id": "pay-1",
                "status": "succeeded",
                "amount": {"value": "3500.00", "currency": "RUB"},
                "metadata": {
                  "invoiceId": "${created.invoice.id}",
                  "paymentAttemptId": "${checkout.paymentAttemptId}"
                }
              }
            }
        """.trimIndent()

        val result = store.processYooKassaWebhook(event)

        assertEquals(PaymentProviderEventStatus.PROCESSED, result.status)
        assertEquals(PaymentInvoiceStatus.PAID, store.publicInvoice(created.publicUrlToken).status)
        assertEquals(PaymentAttemptStatus.SUCCEEDED, store.adminInvoice(created.invoice.id).paymentAttempts.single().status)
    }
}

private class RecordingPaymentProviderClient : PaymentProviderClient {
    val created = mutableListOf<ProviderPaymentCreateCommand>()

    override fun createPayment(command: ProviderPaymentCreateCommand): ProviderPaymentCreateResult {
        created += command
        return ProviderPaymentCreateResult(
            providerPaymentId = "pay-1",
            confirmationUrl = "https://checkout.test/pay-1",
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
            paymentAttemptId = UUID.fromString(command.metadata["paymentAttemptId"]),
        )
    }
}
