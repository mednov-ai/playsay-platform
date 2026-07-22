package com.playsay.email.service

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.http.MediaType
import org.springframework.mail.MailSendException
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException

class MailjetApiOutboundEmailSender(
    private val restClient: RestClient,
    private val objectMapper: ObjectMapper,
    private val fromName: String,
    private val environment: String,
) : OutboundEmailSender {
    override fun send(email: OutboundEmail): OutboundEmailResult {
        val response = try {
            restClient.post()
                .uri("/v3.1/send")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(email.toMailjetRequest())
                .retrieve()
                .body(MailjetSendResponse::class.java)
        } catch (caught: RestClientException) {
            throw MailSendException("Mailjet API request failed", caught)
        }

        val message = response?.messages?.singleOrNull()
            ?: throw MailSendException("Mailjet API returned an unexpected message count")
        if (!message.status.equals("success", ignoreCase = true)) {
            val error = message.errors.orEmpty().joinToString("; ") { item ->
                listOfNotNull(item.errorCode, item.errorMessage).joinToString(": ")
            }
            throw MailSendException("Mailjet API send failed${error.takeIf(String::isNotBlank)?.let { ": $it" }.orEmpty()}")
        }
        val normalizedRecipient = email.to.trim().lowercase()
        val recipient = message.to.orEmpty().singleOrNull { item -> item.email?.trim()?.lowercase() == normalizedRecipient }
            ?: throw MailSendException("Mailjet API did not accept the recipient")
        val messageId = recipient.messageId?.toString()
            ?: throw MailSendException("Mailjet API response is missing MessageID")

        return OutboundEmailResult(
            provider = TransactionalEmailService.PROVIDER_MAILJET,
            providerStatus = "ACCEPTED",
            providerJobId = messageId,
            providerDeliveryStatus = "success",
        )
    }

    private fun OutboundEmail.toMailjetRequest(): MailjetSendRequest =
        MailjetSendRequest(
            messages = listOf(
                MailjetMessage(
                    from = MailjetAddress(email = from, name = fromName),
                    to = listOf(MailjetAddress(email = to)),
                    subject = subject,
                    textPart = textBody,
                    htmlPart = htmlBody,
                    customId = deliveryId.toString(),
                    eventPayload = objectMapper.writeValueAsString(
                        MailjetEventPayload(
                            deliveryId = deliveryId.toString(),
                            attempt = attemptNumber,
                            environment = environment,
                        ),
                    ),
                ),
            ),
        )

    private data class MailjetSendRequest(
        @param:JsonProperty("Messages")
        val messages: List<MailjetMessage>,
    )

    private data class MailjetMessage(
        @param:JsonProperty("From")
        val from: MailjetAddress,
        @param:JsonProperty("To")
        val to: List<MailjetAddress>,
        @param:JsonProperty("Subject")
        val subject: String,
        @param:JsonProperty("TextPart")
        val textPart: String,
        @param:JsonProperty("HTMLPart")
        val htmlPart: String,
        @param:JsonProperty("CustomID")
        val customId: String,
        @param:JsonProperty("EventPayload")
        val eventPayload: String,
    )

    private data class MailjetAddress(
        @param:JsonProperty("Email")
        val email: String,
        @param:JsonProperty("Name")
        val name: String? = null,
    )

    private data class MailjetEventPayload(
        @param:JsonProperty("delivery_id")
        val deliveryId: String,
        val attempt: Int,
        val environment: String,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class MailjetSendResponse(
        @param:JsonProperty("Messages")
        val messages: List<MailjetMessageResponse>? = null,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class MailjetMessageResponse(
        @param:JsonProperty("Status")
        val status: String? = null,
        @param:JsonProperty("To")
        val to: List<MailjetRecipientResponse>? = null,
        @param:JsonProperty("Errors")
        val errors: List<MailjetError>? = null,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class MailjetRecipientResponse(
        @param:JsonProperty("Email")
        val email: String? = null,
        @param:JsonProperty("MessageID")
        val messageId: Long? = null,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class MailjetError(
        @param:JsonProperty("ErrorCode")
        val errorCode: String? = null,
        @param:JsonProperty("ErrorMessage")
        val errorMessage: String? = null,
    )
}
