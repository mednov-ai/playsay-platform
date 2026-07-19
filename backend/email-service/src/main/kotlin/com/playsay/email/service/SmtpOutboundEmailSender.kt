package com.playsay.email.service

import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender

class SmtpOutboundEmailSender(
    private val mailSender: JavaMailSender,
) : OutboundEmailSender {
    override fun send(email: OutboundEmail): OutboundEmailResult {
        val message = SimpleMailMessage()
        message.from = email.from
        message.setTo(email.to)
        message.subject = email.subject
        message.text = email.textBody
        mailSender.send(message)
        return OutboundEmailResult(provider = "SMTP", providerStatus = "NOT_TRACKED")
    }
}
