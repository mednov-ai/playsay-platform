package com.playsay.email.config

import com.playsay.email.service.OutboundEmailSender
import com.playsay.email.service.SmtpOutboundEmailSender
import com.playsay.email.service.UnisenderApiOutboundEmailSender
import com.playsay.email.service.UnisenderDeliveryStatusClient
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.time.Duration
import java.net.http.HttpClient
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.web.client.RestClient

@Configuration
class EmailServiceConfiguration {
    @Bean
    @ConditionalOnMissingBean(ObjectMapper::class)
    fun emailObjectMapper(): ObjectMapper = jacksonObjectMapper().findAndRegisterModules()

    @Bean
    fun emailClock(): Clock = Clock.systemUTC()

    @Bean
    @ConditionalOnMissingBean(OutboundEmailSender::class)
    @ConditionalOnProperty(
        name = ["playsay.email-service.delivery-provider"],
        havingValue = "smtp",
        matchIfMissing = true,
    )
    fun smtpOutboundEmailSender(mailSender: JavaMailSender): OutboundEmailSender =
        SmtpOutboundEmailSender(mailSender)

    @Bean
    @ConditionalOnMissingBean(OutboundEmailSender::class)
    @ConditionalOnProperty(name = ["playsay.email-service.delivery-provider"], havingValue = "unisender-api")
    fun unisenderApiOutboundEmailSender(
        @Value("\${playsay.email-service.unisender.api-base-url}") apiBaseUrl: String,
        @Value("\${playsay.email-service.unisender.api-key}") apiKey: String,
        @Value("\${playsay.email-service.unisender.user-id}") userId: Long,
        @Value("\${playsay.email-service.from-name}") fromName: String,
    ): OutboundEmailSender =
        UnisenderApiOutboundEmailSender(
            restClient = providerRestClientBuilder().baseUrl(apiBaseUrl).build(),
            apiKey = apiKey,
            userId = userId,
            fromName = fromName,
        )

    @Bean
    fun unisenderDeliveryStatusClient(
        @Value("\${playsay.email-service.unisender.api-base-url}") apiBaseUrl: String,
        @Value("\${playsay.email-service.unisender.api-key}") apiKey: String,
    ): UnisenderDeliveryStatusClient = UnisenderDeliveryStatusClient(
        restClient = providerRestClientBuilder()
            .baseUrl(apiBaseUrl)
            .defaultHeader("X-API-KEY", apiKey)
            .build(),
        downloadClient = providerRestClientBuilder().build(),
    )

    private fun providerRestClientBuilder(): RestClient.Builder {
        val httpClient = HttpClient.newBuilder()
            .connectTimeout(PROVIDER_CONNECT_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build()
        val requestFactory = JdkClientHttpRequestFactory(httpClient).apply {
            setReadTimeout(PROVIDER_READ_TIMEOUT)
        }
        return RestClient.builder().requestFactory(requestFactory)
    }

    private companion object {
        val PROVIDER_CONNECT_TIMEOUT: Duration = Duration.ofSeconds(5)
        val PROVIDER_READ_TIMEOUT: Duration = Duration.ofSeconds(20)
    }
}
