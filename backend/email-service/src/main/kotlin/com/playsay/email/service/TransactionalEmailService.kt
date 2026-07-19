package com.playsay.email.service

import com.playsay.email.entity.EmailDeliveryAttemptEntity
import com.playsay.email.repo.EmailDeliveryAttemptRepo
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class TransactionalEmailService(
    private val repo: EmailDeliveryAttemptRepo,
    private val renderer: TransactionalEmailTemplateRenderer,
    private val sender: OutboundEmailSender,
    private val clock: Clock,
    @param:Value("\${playsay.email-service.from-address}") private val fromAddress: String,
) {
    @Transactional(noRollbackFor = [EmailDeliveryProviderException::class])
    fun send(command: TransactionalEmailCommand): String {
        val existing = repo.findLockedByIdempotencyKey(command.idempotencyKey)
        if (existing != null && existing.status != emailStatusFailed) {
            return existing.status
        }

        val now = Instant.now(clock)
        val rendered = renderer.render(command)
        val attempt = if (existing == null) {
            repo.saveAndFlush(EmailDeliveryAttemptEntity(
                id = UUID.randomUUID(),
                idempotencyKey = command.idempotencyKey,
                toEmail = command.to,
                templateKey = command.templateKey,
                locale = command.locale.normalizedLocale(),
                status = emailStatusPending,
                subject = rendered.subject,
                createdAt = now,
                updatedAt = now,
            ))
        } else {
            existing.apply {
                toEmail = command.to
                templateKey = command.templateKey
                locale = command.locale.normalizedLocale()
                status = emailStatusPending
                subject = rendered.subject
                errorMessage = null
                updatedAt = now
            }.also(repo::saveAndFlush)
        }

        try {
            sender.send(
                OutboundEmail(
                    from = fromAddress,
                    to = command.to,
                    subject = rendered.subject,
                    textBody = rendered.textBody,
                    htmlBody = rendered.htmlBody,
                ),
            )
            attempt.status = emailStatusSent
            attempt.updatedAt = Instant.now(clock)
            repo.saveAndFlush(attempt)
            return attempt.status
        } catch (caught: RuntimeException) {
            attempt.status = emailStatusFailed
            attempt.errorMessage = caught.message?.take(1024)
            attempt.updatedAt = Instant.now(clock)
            repo.saveAndFlush(attempt)
            throw EmailDeliveryProviderException(caught)
        }
    }

    private fun String?.normalizedLocale(): String =
        when (this?.trim()?.lowercase()?.substringBefore("-")) {
            "en" -> "en"
            "de" -> "de"
            "fr" -> "fr"
            else -> "ru"
        }

    private companion object {
        const val emailStatusPending = "PENDING"
        const val emailStatusSent = "SENT"
        const val emailStatusFailed = "FAILED"
    }
}

internal class EmailDeliveryProviderException(cause: RuntimeException) :
    RuntimeException(cause.message, cause)
