package com.playsay.payment.config

import com.playsay.payment.repo.PaymentAttemptRepository
import com.playsay.payment.repo.PaymentInvoiceRepository
import com.playsay.payment.repo.PaymentProviderEventRepository
import com.playsay.payment.service.DisabledPaymentProviderClient
import com.playsay.payment.service.PaymentInvoiceOperations
import com.playsay.payment.service.PaymentProviderClient
import com.playsay.payment.service.PersistentPaymentInvoiceStore
import com.playsay.payment.service.YooKassaPaymentProviderClient
import java.time.Clock
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class PaymentServiceConfiguration {
    @Bean
    @ConditionalOnMissingBean(PaymentProviderClient::class)
    fun configuredPaymentProviderClient(
        @Value("\${playsay.payment-service.provider}") provider: String,
        @Value("\${playsay.payment-service.yookassa.api-url}") yookassaApiUrl: String,
        @Value("\${playsay.payment-service.yookassa.shop-id}") yookassaShopId: String,
        @Value("\${playsay.payment-service.yookassa.secret-key}") yookassaSecretKey: String,
    ): PaymentProviderClient =
        if (provider.equals("yookassa", ignoreCase = true)) {
            require(yookassaShopId.isNotBlank()) { "playsay.payment-service.yookassa.shop-id must be configured" }
            require(yookassaSecretKey.isNotBlank()) { "playsay.payment-service.yookassa.secret-key must be configured" }
            YooKassaPaymentProviderClient(
                apiUrl = yookassaApiUrl,
                shopId = yookassaShopId,
                secretKey = yookassaSecretKey,
            )
        } else {
            DisabledPaymentProviderClient()
        }

    @Bean
    fun paymentClock(): Clock = Clock.systemUTC()

    @Bean
    fun persistentPaymentInvoiceStore(
        provider: PaymentProviderClient,
        paymentInvoiceRepository: PaymentInvoiceRepository,
        paymentAttemptRepository: PaymentAttemptRepository,
        paymentProviderEventRepository: PaymentProviderEventRepository,
        paymentClock: Clock,
        @Value("\${playsay.payment-service.public-base-url}") publicBaseUrl: String,
    ): PaymentInvoiceOperations =
        PersistentPaymentInvoiceStore(
            provider = provider,
            invoiceRepository = paymentInvoiceRepository,
            attemptRepository = paymentAttemptRepository,
            eventRepository = paymentProviderEventRepository,
            clock = paymentClock,
            publicBaseUrl = publicBaseUrl,
        )
}
