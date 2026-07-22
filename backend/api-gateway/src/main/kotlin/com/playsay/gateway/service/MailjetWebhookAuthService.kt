package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class MailjetWebhookAuthService(
    @param:Value("\${playsay.email-service.mailjet.webhook-username:}") private val expectedUsername: String,
    @param:Value("\${playsay.email-service.mailjet.webhook-password:}") private val expectedPassword: String,
) {
    fun requireAuthorized(authorization: String?) {
        if (expectedUsername.isBlank() || expectedPassword.isBlank()) unauthorized()
        val encoded = authorization
            ?.takeIf { value -> value.startsWith(BASIC_PREFIX, ignoreCase = true) }
            ?.substring(BASIC_PREFIX.length)
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: unauthorized()
        val credentials = runCatching {
            Base64.getDecoder().decode(encoded).toString(StandardCharsets.UTF_8)
        }.getOrElse { unauthorized() }
        val separator = credentials.indexOf(':')
        if (separator <= 0) unauthorized()
        val username = credentials.substring(0, separator)
        val password = credentials.substring(separator + 1)
        if (!constantTimeEquals(username, expectedUsername) || !constantTimeEquals(password, expectedPassword)) unauthorized()
    }

    private fun constantTimeEquals(actual: String, expected: String): Boolean = MessageDigest.isEqual(
        actual.toByteArray(StandardCharsets.UTF_8),
        expected.toByteArray(StandardCharsets.UTF_8),
    )

    private fun unauthorized(): Nothing = throw ProjectResponseException(
        status = HttpStatus.UNAUTHORIZED,
        message = "Mailjet webhook authentication failed",
        errorCode = MetaData.ErrorCodes.EMAIL_SERVICE_UNAVAILABLE,
    )

    private companion object {
        const val BASIC_PREFIX = "Basic "
    }
}
