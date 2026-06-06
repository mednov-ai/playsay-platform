package com.playsay.email.service

data class TransactionalEmailCommand(
    val to: String,
    val templateKey: String,
    val locale: String?,
    val idempotencyKey: String,
    val model: Map<String, String?>,
)

data class RenderedEmail(
    val subject: String,
    val textBody: String,
    val htmlBody: String,
)

data class OutboundEmail(
    val from: String,
    val to: String,
    val subject: String,
    val textBody: String,
    val htmlBody: String,
)

interface OutboundEmailSender {
    fun send(email: OutboundEmail)
}

interface TransactionalEmailTemplateRenderer {
    fun render(command: TransactionalEmailCommand): RenderedEmail
}
