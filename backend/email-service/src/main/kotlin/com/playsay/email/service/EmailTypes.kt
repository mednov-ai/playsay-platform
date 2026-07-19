package com.playsay.email.service

import java.time.Instant
import java.util.UUID

data class TransactionalEmailCommand(
    val to: String,
    val templateKey: String,
    val locale: String?,
    val idempotencyKey: String,
    val model: Map<String, String?>,
    val replayUntil: Instant? = null,
)

data class RenderedEmail(
    val subject: String,
    val textBody: String,
    val htmlBody: String,
)

data class OutboundEmailResult(
    val provider: String,
    val providerStatus: String,
    val providerJobId: String? = null,
    val providerDeliveryStatus: String? = null,
)

data class TransactionalEmailResult(
    val status: String,
    val deliveryAttemptId: UUID,
    val provider: String?,
    val providerStatus: String?,
)

data class OutboundEmail(
    val from: String,
    val to: String,
    val subject: String,
    val textBody: String,
    val htmlBody: String,
    val deliveryId: UUID,
    val attemptNumber: Int,
)

interface OutboundEmailSender {
    fun send(email: OutboundEmail): OutboundEmailResult
}

interface TransactionalEmailTemplateRenderer {
    fun render(command: TransactionalEmailCommand): RenderedEmail
}
