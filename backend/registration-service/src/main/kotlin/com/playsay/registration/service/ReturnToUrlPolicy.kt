package com.playsay.registration.service

import java.net.URI

class ReturnToUrlPolicy {
    fun allow(value: String?): String? {
        val cleaned = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val uri = runCatching { URI(cleaned) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        val host = uri.host?.lowercase() ?: return null
        if (uri.userInfo != null || scheme !in setOf("http", "https")) {
            return null
        }

        return when {
            scheme == "https" && uri.port == -1 && host in publicHosts -> cleaned
            host in localHosts -> cleaned
            else -> null
        }
    }

    private companion object {
        val publicHosts = setOf(
            "dev.key.honey.school",
            "dev.online.honey.school",
            "dev.key.honeyschool.ru",
            "dev.online.honeyschool.ru",
            "key.honey.school",
            "online.honey.school",
            "key.honeyschool.ru",
            "online.honeyschool.ru",
        )
        val localHosts = setOf("localhost", "127.0.0.1")
    }
}
