package com.playsay.email.service

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import org.springframework.mail.MailSendException
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.util.HtmlUtils

class UnisenderApiOutboundEmailSender(
    private val restClient: RestClient,
    private val apiKey: String,
    private val userId: Long,
    private val fromName: String,
) : OutboundEmailSender {
    override fun send(email: OutboundEmail) {
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
    }

    private fun OutboundEmail.toUnisenderRequest(): UnisenderEmailSendRequest =
        UnisenderEmailSendRequest(
            apiKey = apiKey,
            userId = userId,
            message = UnisenderMessage(
                body = UnisenderBody(
                    html = textBody.toSimpleHtml(),
                    plaintext = textBody,
                ),
                subject = subject,
                fromEmail = from,
                fromName = fromName,
                recipients = listOf(UnisenderRecipient(email = to)),
            ),
        )

    private fun String.toSimpleHtml(): String =
        lineSequence().joinToString("<br>") { HtmlUtils.htmlEscape(it) }

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
    )

    private data class UnisenderBody(
        val html: String,
        val plaintext: String,
    )

    private data class UnisenderRecipient(
        val email: String,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class UnisenderEmailSendResponse(
        val status: String?,
        val code: Int? = null,
        val message: String? = null,
    )
}
