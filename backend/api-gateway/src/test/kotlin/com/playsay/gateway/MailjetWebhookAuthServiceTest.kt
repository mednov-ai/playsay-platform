package com.playsay.gateway

import com.playsay.gateway.service.MailjetWebhookAuthService
import com.playsay.gateway.error.ProjectResponseException
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertFailsWith

class MailjetWebhookAuthServiceTest {
    private val service = MailjetWebhookAuthService("mailjet", "test-secret")

    @Test
    fun `accepts the configured basic credentials`() {
        val encoded = Base64.getEncoder().encodeToString("mailjet:test-secret".toByteArray())
        service.requireAuthorized("Basic $encoded")
    }

    @Test
    fun `rejects missing and invalid credentials`() {
        assertFailsWith<ProjectResponseException> { service.requireAuthorized(null) }
        val encoded = Base64.getEncoder().encodeToString("mailjet:wrong".toByteArray())
        assertFailsWith<ProjectResponseException> { service.requireAuthorized("Basic $encoded") }
    }
}
