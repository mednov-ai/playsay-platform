package com.playsay.keyboard.service

import jakarta.servlet.http.HttpServletRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.HexFormat
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@Service
class AnonymousFingerprintService(
    @param:Value("\${playsay.keyboard.anonymous.fingerprint-secret:dev-keyboard-anonymous}")
    private val secret: String,
) {
    fun fingerprintHash(request: HttpServletRequest): String {
        val forwardedFor = request.getHeader("X-Forwarded-For")
            ?.split(",")
            ?.firstOrNull()
            ?.trim()
            .orEmpty()
        val ip = forwardedFor.ifBlank { request.remoteAddr.orEmpty() }
        val userAgent = request.getHeader("User-Agent").orEmpty().take(256)
        return hmac("$ip|$userAgent")
    }

    private fun hmac(value: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return HexFormat.of().formatHex(mac.doFinal(value.toByteArray(Charsets.UTF_8)))
    }
}
