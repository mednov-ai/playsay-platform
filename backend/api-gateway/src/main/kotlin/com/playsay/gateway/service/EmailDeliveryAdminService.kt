package com.playsay.gateway.service

import com.playsay.gateway.client.EmailDeliveryAdminGateway
import com.playsay.gateway.dto.*
import java.util.UUID
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service

@Service
class EmailDeliveryAdminService(
    private val gateway: EmailDeliveryAdminGateway,
) {
    fun requireAdmin(authentication: JwtAuthenticationToken) = gateway.requireAdmin(authentication)
    fun list(query: EmailDeliveryQuery): EmailDeliveryPageResponse = gateway.list(query)
    fun detail(id: UUID): EmailDeliveryDetailResponse = gateway.detail(id)
    fun resend(id: UUID): EmailDeliveryResendResponse = gateway.resend(id)
    fun forwardUnisenderWebhook(rawBody: String) = gateway.forwardUnisenderWebhook(rawBody)
    fun forwardMailjetWebhook(rawBody: String) = gateway.forwardMailjetWebhook(rawBody)
}
