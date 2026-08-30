package com.playsay.gateway.service

import java.net.URI
import java.net.URISyntaxException
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service

@Service
class LessonAccessOriginPolicy(
    @Value("\${playsay.public-app-url}") publicAppUrl: String,
    @Value("\${playsay.public-app-rf-url:\${playsay.public-app-url}}") publicAppRfUrl: String,
) {
    val directOrigin: String = requireNotNull(normalizeConfigured(publicAppUrl))
    val rfOrigin: String = requireNotNull(normalizeConfigured(publicAppRfUrl))
    val defaultOrigin: String = rfOrigin
    private val allowedOrigins = linkedSetOf(rfOrigin, directOrigin)

    fun resolve(requestOrigin: String): String? = normalizeRequest(requestOrigin)?.takeIf(allowedOrigins::contains)

    fun compactUrl(origin: String, alias: String): String = "$origin/l#$alias"

    fun callback(origin: String): String = "$origin/auth/callback"

    private fun normalizeConfigured(value: String): String? = normalize(value, allowTrailingSlash = true)

    private fun normalizeRequest(value: String): String? = normalize(value, allowTrailingSlash = false)

    private fun normalize(value: String, allowTrailingSlash: Boolean): String? = try {
        val uri = URI(value.trim())
        val pathAllowed = uri.path.isNullOrEmpty() || allowTrailingSlash && uri.path == "/"
        if (uri.scheme !in setOf("http", "https") || uri.host.isNullOrBlank() || uri.userInfo != null ||
            !pathAllowed || uri.query != null || uri.fragment != null
        ) {
            null
        } else {
            val port = if (uri.port == -1) "" else ":${uri.port}"
            "${uri.scheme.lowercase()}://${uri.host.lowercase()}$port"
        }
    } catch (_: IllegalArgumentException) {
        null
    } catch (_: URISyntaxException) {
        null
    }
}
