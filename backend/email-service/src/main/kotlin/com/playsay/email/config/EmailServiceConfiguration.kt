package com.playsay.email.config

import com.playsay.email.service.OutboundEmailSender
import com.playsay.email.service.SmtpOutboundEmailSender
import com.playsay.email.service.UnisenderApiOutboundEmailSender
import com.playsay.email.service.UnisenderDeliveryStatusClient
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
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
            restClient = RestClient.builder().baseUrl(apiBaseUrl).build(),
            apiKey = apiKey,
            userId = userId,
            fromName = fromName,
        )

    @Bean
    fun unisenderDeliveryStatusClient(
        @Value("\${playsay.email-service.unisender.api-base-url}") apiBaseUrl: String,
        @Value("\${playsay.email-service.unisender.api-key}") apiKey: String,
    ): UnisenderDeliveryStatusClient = UnisenderDeliveryStatusClient(
        restClient = RestClient.builder()
            .baseUrl(apiBaseUrl)
            .defaultHeader("X-API-KEY", apiKey)
            .build(),
        downloadClient = RestClient.create(),
    )
}
