package com.playsay.email.config

import com.playsay.email.service.OutboundEmailSender
import com.playsay.email.service.SmtpOutboundEmailSender
import com.playsay.email.service.UnisenderApiOutboundEmailSender
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
}
