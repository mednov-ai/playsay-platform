package com.playsay.gateway.service

import com.playsay.gateway.config.RegionalRoutingEnvironment
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.time.Clock
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class RegionalRoutingEnvironmentTest {
    @Test
    fun `each environment selects only its own exact origin and endpoints`() {
        listOf("dev", "prod").forEach { environment ->
            val allowed = requireNotNull(RegionalRoutingEnvironment.forName(environment))
            val other = requireNotNull(RegionalRoutingEnvironment.forName(if (environment == "dev") "prod" else "dev"))
            val media = media(environment, allowed.issuer, allowed.signalingUrl)
            val collaboration = collaboration(environment, allowed.issuer, allowed.collaborationUrl)
            media.validateConfiguration()
            collaboration.validateConfiguration()
            val selection = assertNotNull(media.selectionFor(allowed.origin))
            assertEquals(allowed.signalingUrl, selection.serverUrl)
            assertEquals(allowed.relayUrls, assertNotNull(selection.mediaRouting).iceServers.single().urls)
            assertEquals(allowed.collaborationUrl, collaboration.websocketUrlFor(allowed.origin))
            listOf(other.origin, null, allowed.origin + "/", allowed.origin + ".evil.example").forEach { origin ->
                assertNull(media.selectionFor(origin))
                assertEquals(allowed.directCollaborationUrl, collaboration.websocketUrlFor(origin))
            }
        }
    }

    @Test
    fun `cross environment issuer or endpoint fails configuration and cannot select a route`() {
        listOf("dev", "prod").forEach { environment ->
            val allowed = requireNotNull(RegionalRoutingEnvironment.forName(environment))
            val other = requireNotNull(RegionalRoutingEnvironment.forName(if (environment == "dev") "prod" else "dev"))
            val wrongIssuer = media(environment, other.issuer, allowed.signalingUrl)
            assertFailsWith<IllegalArgumentException> { wrongIssuer.validateConfiguration() }
            assertNull(wrongIssuer.selectionFor(allowed.origin))
            assertFailsWith<IllegalArgumentException> {
                media(environment, allowed.issuer, other.signalingUrl).validateConfiguration()
            }
            val wrongCollaborationIssuer = collaboration(environment, other.issuer, allowed.collaborationUrl)
            assertFailsWith<IllegalArgumentException> { wrongCollaborationIssuer.validateConfiguration() }
            assertEquals(allowed.directCollaborationUrl, wrongCollaborationIssuer.websocketUrlFor(allowed.origin))
            assertFailsWith<IllegalArgumentException> {
                collaboration(environment, allowed.issuer, other.collaborationUrl).validateConfiguration()
            }
        }
    }

    @Test
    fun `unknown environments cannot enable relay`() {
        listOf("local", "staging", "PROD", "").forEach { environment ->
            val service = media(environment, "", "")
            assertFailsWith<IllegalArgumentException> { service.validateConfiguration() }
            assertNull(service.selectionFor("https://dev.online.honeyschool.ru"))
        }
    }

    private fun media(environment: String, issuer: String, signaling: String) = RegionalMediaRoutingService(
        environment, "off", "rf-two-hop", "rf-turn-relay", signaling, "a".repeat(64), 900,
        Clock.systemUTC(), SimpleMeterRegistry(), issuer,
    )

    private fun collaboration(environment: String, issuer: String, websocket: String) =
        RegionalCollaborationRoutingService(
            requireNotNull(RegionalRoutingEnvironment.forName(environment)).directCollaborationUrl,
            environment, "rf-two-hop", websocket, SimpleMeterRegistry(), issuer,
        )
}
