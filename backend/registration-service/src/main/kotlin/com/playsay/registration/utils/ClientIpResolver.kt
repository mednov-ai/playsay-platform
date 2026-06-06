package com.playsay.registration.utils

import jakarta.servlet.http.HttpServletRequest
import org.springframework.stereotype.Component

@Component
class ClientIpResolver {
    fun resolve(request: HttpServletRequest): String? =
        firstForwardedAddress(request.getHeader(xForwardedForHeader))
            ?: cleanAddress(request.getHeader(xRealIpHeader))
            ?: cleanAddress(request.remoteAddr)

    private fun firstForwardedAddress(value: String?): String? =
        value
            ?.split(",")
            ?.firstNotNullOfOrNull(::cleanAddress)

    private fun cleanAddress(value: String?): String? {
        val cleaned = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return cleaned.takeIf { it.length <= maxAddressLength && it.none(Char::isISOControl) }
    }

    private companion object {
        const val xForwardedForHeader = "X-Forwarded-For"
        const val xRealIpHeader = "X-Real-IP"
        const val maxAddressLength = 128
    }
}
