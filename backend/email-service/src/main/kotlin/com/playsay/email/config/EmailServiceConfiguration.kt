package com.playsay.email.config

import com.playsay.email.service.OutboundEmailSender
import com.playsay.email.service.SmtpOutboundEmailSender
import java.time.Clock
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.mail.javamail.JavaMailSender

@Configuration
class EmailServiceConfiguration {
    @Bean
    fun emailClock(): Clock = Clock.systemUTC()

    @Bean
    @ConditionalOnMissingBean(OutboundEmailSender::class)
    fun smtpOutboundEmailSender(mailSender: JavaMailSender): OutboundEmailSender =
        SmtpOutboundEmailSender(mailSender)
}
