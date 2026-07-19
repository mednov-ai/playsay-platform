package com.playsay.email.service

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import org.springframework.mail.MailSendException
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException

class UnisenderApiOutboundEmailSender(
    private val restClient: RestClient,
    private val apiKey: String,
    private val userId: Long,
    private val fromName: String,
) : OutboundEmailSender {
    override fun send(email: OutboundEmail): OutboundEmailResult {
        if (apiKey.isBlank()) {
            throw MailSendException("Unisender API key is not configured")
        }
        val response = try {
            restClient.post()
                .uri("/email/send.json")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(email.toUnisenderRequest())
                .retrieve()
                .body(UnisenderEmailSendResponse::class.java)
        } catch (caught: RestClientException) {
            throw MailSendException("Unisender API request failed", caught)
        }

        if (response?.status != "success") {
            throw MailSendException(
                "Unisender API send failed: status=${response?.status}, code=${response?.code}, message=${response?.message}",
            )
        }
        val normalizedRecipient = email.to.trim().lowercase()
        val recipientFailure = response.failedEmails.orEmpty().entries
            .firstOrNull { (address, _) -> address.trim().lowercase() == normalizedRecipient }
            ?.value
        if (recipientFailure != null || response.emails.orEmpty().none { address -> address.trim().lowercase() == normalizedRecipient }) {
            throw MailSendException("Unisender API rejected recipient: ${recipientFailure ?: "not_accepted"}")
        }
        return OutboundEmailResult(
            provider = "UNISENDER_API",
            providerStatus = "ACCEPTED",
            providerJobId = response.jobId,
            providerDeliveryStatus = "ok_accepted",
        )
    }

    private fun OutboundEmail.toUnisenderRequest(): UnisenderEmailSendRequest =
        UnisenderEmailSendRequest(
            apiKey = apiKey,
            userId = userId,
            message = UnisenderMessage(
                body = UnisenderBody(
                    html = htmlBody,
                    plaintext = textBody,
                ),
                subject = subject,
                fromEmail = from,
                fromName = fromName,
                recipients = listOf(
                    UnisenderRecipient(
                        email = to,
                        metadata = mapOf(
                            "playsay_delivery_id" to deliveryId.toString(),
                            "playsay_attempt" to attemptNumber.toString(),
                        ),
                    ),
                ),
                idempotenceKey = "$deliveryId:$attemptNumber",
            ),
        )

    private data class UnisenderEmailSendRequest(
        @get:JsonProperty("api_key")
        @param:JsonProperty("api_key")
        val apiKey: String,
        @param:JsonProperty("user_id")
        val userId: Long,
        val message: UnisenderMessage,
    )

    private data class UnisenderMessage(
        @param:JsonProperty("template_engine")
        val templateEngine: String = "velocity",
        val body: UnisenderBody,
        val subject: String,
        @param:JsonProperty("from_email")
        val fromEmail: String,
        @param:JsonProperty("from_name")
        val fromName: String,
        val recipients: List<UnisenderRecipient>,
        @param:JsonProperty("idempotence_key")
        val idempotenceKey: String,
    )

    private data class UnisenderBody(
        val html: String,
        val plaintext: String,
    )

    private data class UnisenderRecipient(
        val email: String,
        val metadata: Map<String, String>,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class UnisenderEmailSendResponse(
        val status: String?,
        @param:JsonProperty("job_id")
        val jobId: String? = null,
        val emails: List<String>? = null,
        @param:JsonProperty("failed_emails")
        val failedEmails: Map<String, String>? = null,
        val code: Int? = null,
        val message: String? = null,
    )
}
