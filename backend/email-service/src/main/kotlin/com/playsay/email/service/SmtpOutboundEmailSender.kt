package com.playsay.email.service

import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender

class SmtpOutboundEmailSender(
    private val mailSender: JavaMailSender,
) : OutboundEmailSender {
    override fun send(email: OutboundEmail) {
        val message = SimpleMailMessage()
        message.from = email.from
        message.setTo(email.to)
        message.subject = email.subject
        message.text = email.textBody
        mailSender.send(message)
    }
}
