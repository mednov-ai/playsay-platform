package com.playsay.gateway.service

import com.playsay.gateway.dto.MaterialExternalActivityResolveResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.net.IDN
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class MaterialExternalActivityResolver {
    fun resolve(input: String): MaterialExternalActivityResolveResponse {
        val source = input.trim()
        if (source.isEmpty() || source.length > MAX_URL_LENGTH || source.any { it.isISOControl() }) {
            invalid()
        }

        val parsed = try {
            URI(source)
        } catch (_: Exception) {
            invalid()
        }
        if (!parsed.scheme.equals("https", ignoreCase = true)) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_HTTPS_REQUIRED,
            )
        }
        if (parsed.rawUserInfo != null || parsed.host.isNullOrBlank()) {
            invalid()
        }

        val host = normalizeHost(parsed.host)
        if (isBlockedHost(host)) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_HOST_BLOCKED,
            )
        }

        val provider = providerFor(host)
        val fragment = parsed.rawFragment?.takeUnless { it.equals("google_vignette", ignoreCase = true) }
        val normalized = URI(
            "https",
            null,
            host,
            parsed.port,
            parsed.rawPath.ifEmpty { "/" },
            parsed.rawQuery,
            fragment,
        ).toASCIIString()

        return MaterialExternalActivityResolveResponse(
            normalizedUrl = normalized,
            provider = provider ?: "EXPERIMENTAL",
            supportLevel = if (provider == null) "EXPERIMENTAL" else "GUARANTEED",
            host = host,
            warningCode = if (provider == null) EXPERIMENTAL_WARNING else null,
        )
    }

    private fun normalizeHost(rawHost: String): String {
        val withoutBrackets = rawHost.removePrefix("[").removeSuffix("]")
        return if (withoutBrackets.contains(':')) {
            withoutBrackets.lowercase()
        } else {
            try {
                IDN.toASCII(withoutBrackets, IDN.USE_STD3_ASCII_RULES).lowercase()
            } catch (_: IllegalArgumentException) {
                invalid()
            }
        }
    }

    private fun providerFor(host: String): String? = GUARANTEED_PROVIDERS.entries
        .firstOrNull { (domain) -> host == domain || host.endsWith(".$domain") }
        ?.value

    private fun isBlockedHost(host: String): Boolean {
        if (host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true
        if (IPV4_LITERAL.matches(host)) return isBlockedIpv4(host)
        if (!host.contains(':')) return false
        return try {
            val address = InetAddress.getByName(host)
            address !is Inet6Address || address.isAnyLocalAddress || address.isLoopbackAddress ||
                address.isLinkLocalAddress || address.isSiteLocalAddress ||
                host.startsWith("fc", true) || host.startsWith("fd", true) ||
                host.startsWith("ff", true) || host.startsWith("2001:db8", true)
        } catch (_: Exception) {
            true
        }
    }

    private fun isBlockedIpv4(host: String): Boolean {
        val parts = host.split('.').map { it.toIntOrNull() ?: return true }
        if (parts.size != 4 || parts.any { it !in 0..255 }) return true
        val (a, b) = parts
        return a == 0 || a == 10 || a == 127 || a >= 224 ||
            (a == 100 && b in 64..127) ||
            (a == 169 && b == 254) ||
            (a == 172 && b in 16..31) ||
            (a == 192 && b == 0) ||
            (a == 192 && b == 168) ||
            (a == 198 && b in 18..19) ||
            (a == 198 && b == 51 && parts[2] == 100) ||
            (a == 203 && b == 0 && parts[2] == 113)
    }

    private fun invalid(): Nothing = throw ProjectResponseException.localized(
        HttpStatus.BAD_REQUEST,
        MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_URL_INVALID,
    )

    private companion object {
        const val MAX_URL_LENGTH = 2_048
        const val EXPERIMENTAL_WARNING = "MATERIAL_EXTERNAL_ACTIVITY_EXPERIMENTAL_HOST"
        val IPV4_LITERAL = Regex("^[0-9.]+$")
        val GUARANTEED_PROVIDERS = linkedMapOf(
            "liveworksheets.com" to "LIVEWORKSHEETS",
            "wordwall.net" to "WORDWALL",
            "islcollective.com" to "ISLCOLLECTIVE",
            "topworksheets.com" to "TOPWORKSHEETS",
            "jeopardylabs.com" to "JEOPARDYLABS",
        )
    }
}
