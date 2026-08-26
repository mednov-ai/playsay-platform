package com.playsay.gateway.service

import com.playsay.gateway.config.ChatPushProperties
import com.playsay.gateway.dto.ChatPushCapabilityResponse
import com.playsay.gateway.dto.ChatPushSubscriptionRequest
import com.playsay.gateway.dto.ChatPushSubscriptionResponse
import com.playsay.gateway.entity.ChatPushSubscriptionEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.ChatPushSubscriptionRepo
import com.playsay.gateway.utils.MetaData
import java.net.URI
import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.util.Base64
import java.util.HexFormat
import java.util.Locale
import java.util.UUID
import kotlin.text.Charsets.UTF_8
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ChatPushSubscriptionService(
    private val properties: ChatPushProperties,
    private val subscriptions: ChatPushSubscriptionRepo,
    private val userProfileStore: UserProfileStore,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun capability(authentication: JwtAuthenticationToken): ChatPushCapabilityResponse {
        requireChatRole(authentication)
        return ChatPushCapabilityResponse(
            available = properties.enabled,
            publicKey = properties.publicKey.takeIf { properties.enabled },
        )
    }

    @Transactional
    fun upsert(
        authentication: JwtAuthenticationToken,
        request: ChatPushSubscriptionRequest,
    ): ChatPushSubscriptionResponse {
        requireChatRole(authentication)
        if (!properties.enabled) return ChatPushSubscriptionResponse(enabled = false)
        val endpoint = validatedEndpoint(request.endpoint)
        validateSubscriptionKey(request.p256dh, expectedBytes = 65)
        validateSubscriptionKey(request.auth, expectedBytes = 16)
        val now = Instant.now(clock)
        val userId = userProfileStore.currentUserId(authentication)
        val endpointHash = endpointHash(endpoint)
        val existing = subscriptions.findByEndpointHash(endpointHash)
        subscriptions.saveAndFlush(
            existing?.apply {
                this.userId = userId
                this.endpoint = endpoint
                this.p256dh = request.p256dh
                this.authSecret = request.auth
                this.locale = normalizeLocale(request.locale)
                this.active = true
                this.updatedAt = now
            } ?: ChatPushSubscriptionEntity(
                id = UUID.randomUUID(),
                userId = userId,
                endpoint = endpoint,
                endpointHash = endpointHash,
                p256dh = request.p256dh,
                authSecret = request.auth,
                locale = normalizeLocale(request.locale),
                active = true,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return ChatPushSubscriptionResponse(enabled = true)
    }

    @Transactional
    fun remove(authentication: JwtAuthenticationToken, endpointValue: String): ChatPushSubscriptionResponse {
        requireChatRole(authentication)
        val endpoint = validatedEndpoint(endpointValue)
        val currentUserId = userProfileStore.currentUserId(authentication)
        subscriptions.findByEndpointHash(endpointHash(endpoint))
            ?.takeIf { it.userId == currentUserId }
            ?.let(subscriptions::delete)
        return ChatPushSubscriptionResponse(enabled = false)
    }

    private fun requireChatRole(authentication: JwtAuthenticationToken) {
        val hasRole = authentication.authorities.any {
            it.authority == MetaData.Authorities.TEACHER || it.authority == MetaData.Authorities.STUDENT
        }
        if (!hasRole || authentication.authorities.any { it.authority == MetaData.Authorities.ADMIN }) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.CHAT_ROLE_REQUIRED)
        }
    }

    private fun validatedEndpoint(value: String): String {
        val endpoint = value.trim()
        val uri = runCatching { URI(endpoint) }.getOrNull()
        if (uri?.scheme != "https" || uri.host.isNullOrBlank() || endpoint.length > 2_048) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_REQUEST)
        }
        return endpoint
    }

    private fun validateSubscriptionKey(value: String, expectedBytes: Int) {
        val decoded = runCatching { Base64.getUrlDecoder().decode(padded(value)) }.getOrNull()
        if (decoded?.size != expectedBytes) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_REQUEST)
        }
    }

    private fun padded(value: String): String = value + "=".repeat((4 - value.length % 4) % 4)

    private fun endpointHash(endpoint: String): String = HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest(endpoint.toByteArray(UTF_8)),
    )

    private fun normalizeLocale(value: String): String = value.trim().lowercase(Locale.ROOT)
        .substringBefore('-')
        .substringBefore('_')
        .takeIf { it in supportedLocales }
        ?: "ru"

    private companion object {
        val supportedLocales = setOf("ru", "en", "de", "fr")
    }
}
