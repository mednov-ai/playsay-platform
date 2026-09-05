package com.playsay.gateway.service

import com.playsay.gateway.config.RegionalRoutingEnvironment
import com.playsay.gateway.dto.MediaRoutingIceServerResponse
import com.playsay.gateway.dto.MediaRoutingResponse
import io.micrometer.core.instrument.MeterRegistry
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

data class RegionalClassroomRoutingSelection(
    val serverUrl: String?,
    val mediaRouting: MediaRoutingResponse?,
)

@Component
@Suppress("LongParameterList")
class RegionalMediaRoutingService(
    @param:Value("\${playsay.livekit.regional-relay.environment:local}") private val environment: String,
    @param:Value("\${playsay.livekit.regional-relay.mode:off}") private val legacyMode: String,
    @param:Value("\${playsay.livekit.regional-relay.signaling-mode:}") private val signalingMode: String,
    @param:Value("\${playsay.livekit.regional-relay.media-mode:}") private val mediaMode: String,
    @param:Value("\${playsay.livekit.regional-relay.signaling-url:}") private val signalingUrl: String,
    @param:Value("\${playsay.livekit.regional-relay.shared-secret:}") private val sharedSecret: String,
    @param:Value("\${playsay.livekit.regional-relay.credential-ttl-seconds:900}") private val credentialTtlSeconds: Long,
    private val clock: Clock,
    private val meterRegistry: MeterRegistry,
    @param:Value("\${spring.security.oauth2.resourceserver.jwt.issuer-uri:}") private val issuerUri: String,
) {
    private val routingEnvironment = RegionalRoutingEnvironment.forName(environment)

    @PostConstruct
    fun validateConfiguration() {
        require(legacyMode in supportedLegacyModes) { "Unsupported regional relay compatibility mode" }
        require(signalingMode.isBlank() || signalingMode in supportedSignalingModes) {
            "Unsupported regional signaling mode"
        }
        require(mediaMode.isBlank() || mediaMode in supportedMediaModes) { "Unsupported regional media mode" }

        val selectedSignalingMode = resolvedSignalingMode()
        val selectedMediaMode = resolvedMediaMode()
        require(selectedMediaMode != rfMediaMode || selectedSignalingMode == rfSignalingMode) {
            "Regional media requires regional signaling"
        }
        if (selectedSignalingMode == rfSignalingMode || selectedMediaMode == rfMediaMode) {
            require(routingEnvironment != null) { "Regional routing environment is invalid" }
            require(issuerUri == routingEnvironment.issuer) { "Regional routing issuer is invalid" }
        }
        if (selectedSignalingMode == rfSignalingMode) {
            require(signalingUrl.trim() == routingEnvironment?.signalingUrl) { "Regional classroom signaling URL is invalid" }
        }
        if (selectedMediaMode == rfMediaMode) {
            require(sharedSecret.matches(secretPattern)) { "Regional media relay secret is invalid" }
            require(credentialTtlSeconds in 60..maximumCredentialTtlSeconds) {
                "Regional media relay credential lifetime is invalid"
            }
        }
    }

    fun selectionFor(origin: String?): RegionalClassroomRoutingSelection? {
        val trustedRequest = routingEnvironment != null && origin == routingEnvironment.origin &&
            issuerUri == routingEnvironment.issuer
        val signalingSelected = trustedRequest && resolvedSignalingMode() == rfSignalingMode
        val mediaSelected = trustedRequest && resolvedMediaMode() == rfMediaMode
        recordSignalingRoute(if (signalingSelected) regionalSignalingRouteClass else baselineSignalingRouteClass)
        recordMediaPolicy(if (mediaSelected) regionalMediaPolicyClass else baselineMediaPolicyClass)

        if (!signalingSelected && !mediaSelected) {
            return null
        }

        return RegionalClassroomRoutingSelection(
            serverUrl = routingEnvironment?.signalingUrl.takeIf { signalingSelected },
            mediaRouting = if (mediaSelected) createMediaRouting() else null,
        )
    }

    private fun createMediaRouting(): MediaRoutingResponse {
        val expiresAt = Instant.now(clock).plusSeconds(credentialTtlSeconds)
        val username = "${expiresAt.epochSecond}:${randomIdentifier()}"
        val credential = sign(username)
        return MediaRoutingResponse(
            policy = regionalPolicy,
            revision = routingRevision,
            iceTransportPolicy = relayTransportPolicy,
            iceServers = listOf(
                MediaRoutingIceServerResponse(
                    urls = requireNotNull(routingEnvironment).relayUrls,
                    username = username,
                    credential = credential,
                ),
            ),
            expiresAt = expiresAt,
        )
    }

    private fun resolvedSignalingMode(): String = signalingMode.ifBlank {
        if (legacyMode == legacyCombinedMode) rfSignalingMode else offMode
    }

    private fun resolvedMediaMode(): String = mediaMode.ifBlank { offMode }

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

    private fun recordSignalingRoute(routeClass: String) {
        meterRegistry.counter(signalingRouteSelectionMetric, routeClassTag, routeClass).increment()
        meterRegistry.counter(legacyRouteSelectionMetric, routeClassTag, routeClass).increment()
    }

    private fun recordMediaPolicy(policyClass: String) {
        meterRegistry.counter(mediaPolicySelectionMetric, policyClassTag, policyClass).increment()
    }

    companion object {
        private const val offMode = "off"
        private const val legacyCombinedMode = "rf-origin-relay"
        private const val rfSignalingMode = "rf-two-hop"
        private const val rfMediaMode = "rf-turn-relay"
        private const val regionalPolicy = "REGIONAL_RELAY"
        private const val routingRevision = "selectel-rf-v1"
        private const val relayTransportPolicy = "relay"
        private const val signalingRouteSelectionMetric = "playsay.classroom.signaling.route.selections"
        private const val mediaPolicySelectionMetric = "playsay.classroom.media.policy.selections"
        private const val legacyRouteSelectionMetric = "playsay.classroom.route.selections"
        private const val routeClassTag = "route"
        private const val policyClassTag = "policy"
        private const val baselineSignalingRouteClass = "direct-school"
        private const val regionalSignalingRouteClass = "rf-two-hop"
        private const val baselineMediaPolicyClass = "baseline"
        private const val regionalMediaPolicyClass = "rf-turn-relay"
        private const val maximumCredentialTtlSeconds = 900L
        private const val hmacAlgorithm = "HmacSHA1"
        private val supportedLegacyModes = setOf(offMode, legacyCombinedMode)
        private val supportedSignalingModes = setOf(offMode, rfSignalingMode)
        private val supportedMediaModes = setOf(offMode, rfMediaMode)
        private val secretPattern = Regex("^[0-9a-f]{64}$")
        private val secureRandom = SecureRandom()
    }
}
