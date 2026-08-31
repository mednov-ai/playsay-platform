package com.playsay.gateway.service

import com.playsay.gateway.dto.MediaRoutingIceServerResponse
import com.playsay.gateway.dto.MediaRoutingResponse
import jakarta.annotation.PostConstruct
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.time.Clock
import java.time.Instant
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class RegionalMediaRoutingService(
    @param:Value("\${playsay.livekit.regional-relay.environment:local}") private val environment: String,
    @param:Value("\${playsay.livekit.regional-relay.mode:off}") private val mode: String,
    @param:Value("\${playsay.livekit.regional-relay.shared-secret:}") private val sharedSecret: String,
    @param:Value("\${playsay.livekit.regional-relay.credential-ttl-seconds:900}") private val credentialTtlSeconds: Long,
    private val clock: Clock,
) {
    @PostConstruct
    fun validateConfiguration() {
        require(mode in supportedModes) { "Unsupported regional media relay mode" }
        if (mode == enabledMode) {
            require(environment == productionEnvironment) { "Regional media relay can be enabled only in production" }
            require(sharedSecret.matches(secretPattern)) { "Regional media relay secret is invalid" }
            require(credentialTtlSeconds in 60..maximumCredentialTtlSeconds) {
                "Regional media relay credential lifetime is invalid"
            }
        }
    }

    fun routingFor(origin: String?): MediaRoutingResponse? {
        if (mode != enabledMode || environment != productionEnvironment || origin != trustedOrigin) return null

        val expiresAt = Instant.now(clock).plusSeconds(credentialTtlSeconds)
        val username = "${expiresAt.epochSecond}:${randomIdentifier()}"
        val credential = sign(username)
        return MediaRoutingResponse(
            policy = regionalPolicy,
            revision = routingRevision,
            iceTransportPolicy = relayTransportPolicy,
            iceServers = listOf(
                MediaRoutingIceServerResponse(
                    urls = relayUrls,
                    username = username,
                    credential = credential,
                ),
            ),
            expiresAt = expiresAt,
        )
    }

    private fun randomIdentifier(): String {
        val bytes = ByteArray(16)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun sign(username: String): String {
        val mac = Mac.getInstance(hmacAlgorithm)
        mac.init(SecretKeySpec(sharedSecret.toByteArray(StandardCharsets.UTF_8), hmacAlgorithm))
        return Base64.getEncoder().encodeToString(mac.doFinal(username.toByteArray(StandardCharsets.UTF_8)))
    }

    companion object {
        private const val enabledMode = "rf-origin-relay"
        private const val productionEnvironment = "prod"
        private const val trustedOrigin = "https://online.honeyschool.ru"
        private const val regionalPolicy = "REGIONAL_RELAY"
        private const val routingRevision = "selectel-rf-v1"
        private const val relayTransportPolicy = "relay"
        private const val maximumCredentialTtlSeconds = 900L
        private const val hmacAlgorithm = "HmacSHA1"
        private val supportedModes = setOf("off", enabledMode)
        private val secretPattern = Regex("^[0-9a-f]{64}$")
        private val secureRandom = SecureRandom()
        private val relayUrls = listOf(
            "turn:turn.honeyschool.ru:3478?transport=udp",
            "turn:turn.honeyschool.ru:3478?transport=tcp",
            "turns:turn.honeyschool.ru:5349?transport=tcp",
        )
    }
}
