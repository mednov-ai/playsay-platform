package com.playsay.payment

import com.playsay.payment.fixture.PaymentInvoiceOperationsBehavior
import com.playsay.payment.fixture.PaymentInvoiceStore
import com.playsay.payment.fixture.RecordingPaymentProviderClient
import com.playsay.payment.service.PaymentInvoiceOperations
import org.junit.jupiter.api.BeforeEach

class PaymentInvoiceStoreTest : PaymentInvoiceOperationsBehavior() {
    private lateinit var recordingProvider: RecordingPaymentProviderClient
    private lateinit var store: PaymentInvoiceStore

    @BeforeEach
    fun resetStore() {
        recordingProvider = RecordingPaymentProviderClient()
        store = PaymentInvoiceStore(provider = recordingProvider)
    }

    override fun operations(): PaymentInvoiceOperations = store

    override fun provider(): RecordingPaymentProviderClient = recordingProvider
}
