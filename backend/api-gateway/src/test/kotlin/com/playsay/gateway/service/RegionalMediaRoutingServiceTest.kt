package com.playsay.gateway.service

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RegionalMediaRoutingServiceTest {
    private val fixedClock = Clock.fixed(Instant.parse("2026-08-31T10:00:00Z"), ZoneOffset.UTC)
    private val secret = "a".repeat(64)

    @Test
    fun `disabled routing leaves every origin unchanged`() {
        val service = service(environment = "prod")
        service.validateConfiguration()
        assertNull(service.selectionFor("https://online.honeyschool.ru"))
        assertNull(service.selectionFor("https://online.honey.school"))
    }

    @Test
    fun `legacy combined mode maps to signaling only during migration`() {
        val service = service(
            environment = "prod",
            legacyMode = "rf-origin-relay",
            signalingMode = "",
            mediaMode = "",
        )
        service.validateConfiguration()
        val selection = requireNotNull(service.selectionFor("https://online.honeyschool.ru"))
        assertEquals("wss://online.honeyschool.ru/livekit", selection.serverUrl)
        assertNull(selection.mediaRouting)
    }

    @Test
    fun `separate production controls accept only exact trusted rf origin`() {
        val service = enabledService()
        service.validateConfiguration()
        assertNull(service.selectionFor("https://online.honey.school"))
        assertNull(service.selectionFor("https://online.honeyschool.ru.evil.example"))
        assertNull(service.selectionFor(null))

        val selection = requireNotNull(service.selectionFor("https://online.honeyschool.ru"))
        assertEquals("wss://online.honeyschool.ru/livekit", selection.serverUrl)
        val routing = requireNotNull(selection.mediaRouting)
        assertEquals("REGIONAL_RELAY", routing.policy)
        assertEquals("selectel-rf-v1", routing.revision)
        assertEquals("relay", routing.iceTransportPolicy)
        assertEquals(Instant.parse("2026-08-31T10:15:00Z"), routing.expiresAt)
        assertEquals(3, routing.iceServers.single().urls.size)
        assertTrue(routing.iceServers.single().username.startsWith("1788171300:"))
        assertTrue(routing.iceServers.single().credential.isNotBlank())
    }

    @Test
    fun `regional media cannot be enabled without regional signaling`() {
        val service = service(
            environment = "prod",
            signalingMode = "off",
            mediaMode = "rf-turn-relay",
            sharedSecret = secret,
        )
        assertFailsWith<IllegalArgumentException> { service.validateConfiguration() }
    }

    @Test
    fun `dev rejects production signaling endpoint`() {
        assertFailsWith<IllegalArgumentException> { enabledService(environment = "dev").validateConfiguration() }
    }

    @Test
    fun `enabled routing rejects malformed modes secret and ttl`() {
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", legacyMode = "unexpected").validateConfiguration()
        }
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", signalingMode = "unexpected").validateConfiguration()
        }
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", mediaMode = "unexpected").validateConfiguration()
        }
        assertFailsWith<IllegalArgumentException> { enabledService(sharedSecret = "short").validateConfiguration() }
        assertFailsWith<IllegalArgumentException> { enabledService(ttlSeconds = 901).validateConfiguration() }
    }

    @Test
    fun `enabled signaling rejects missing or non allowlisted url without echoing it`() {
        val missing = assertFailsWith<IllegalArgumentException> {
            enabledService(signalingUrl = "").validateConfiguration()
        }
        assertEquals("Regional classroom signaling URL is invalid", missing.message)

        val supplied = "wss://online.honey.school/livekit?access_token=prohibited"
        val untrusted = assertFailsWith<IllegalArgumentException> {
            enabledService(signalingUrl = supplied).validateConfiguration()
        }
        assertEquals("Regional classroom signaling URL is invalid", untrusted.message)
        assertFalse(untrusted.message.orEmpty().contains(supplied))
    }

    @Test
    fun `route metrics expose separate bounded signaling and media classes`() {
        val registry = SimpleMeterRegistry()
        val service = enabledService(meterRegistry = registry)
        service.selectionFor("https://online.honey.school")
        val selection = requireNotNull(service.selectionFor("https://online.honeyschool.ru"))

        val signalingMeters = registry.meters.filter {
            it.id.name == "playsay.classroom.signaling.route.selections"
        }
        assertEquals(setOf("direct-school", "rf-two-hop"), signalingMeters.map { it.id.getTag("route") }.toSet())
        val mediaMeters = registry.meters.filter {
            it.id.name == "playsay.classroom.media.policy.selections"
        }
        assertEquals(setOf("baseline", "rf-turn-relay"), mediaMeters.map { it.id.getTag("policy") }.toSet())

        val exposedMetadata = (signalingMeters + mediaMeters).flatMap { meter ->
            listOf(meter.id.name) + meter.id.tags.flatMap { tag -> listOf(tag.key, tag.value) }
        }.joinToString(" ")
        val routing = requireNotNull(selection.mediaRouting)
        listOf(
            selection.serverUrl.orEmpty(),
            routing.iceServers.single().username,
            routing.iceServers.single().credential,
            "https://online.honey.school",
        ).forEach { sensitiveValue -> assertFalse(exposedMetadata.contains(sensitiveValue)) }
    }

    private fun enabledService(
        environment: String = "prod",
        sharedSecret: String = secret,
        ttlSeconds: Long = 900,
        signalingUrl: String = "wss://online.honeyschool.ru/livekit",
        meterRegistry: SimpleMeterRegistry = SimpleMeterRegistry(),
    ) = service(
        environment = environment,
        signalingMode = "rf-two-hop",
        mediaMode = "rf-turn-relay",
        sharedSecret = sharedSecret,
        ttlSeconds = ttlSeconds,
        signalingUrl = signalingUrl,
        meterRegistry = meterRegistry,
    )

    private fun service(
        environment: String,
        legacyMode: String = "off",
        signalingMode: String = "off",
        mediaMode: String = "off",
        sharedSecret: String = "",
        ttlSeconds: Long = 900,
        signalingUrl: String = "wss://online.honeyschool.ru/livekit",
        meterRegistry: SimpleMeterRegistry = SimpleMeterRegistry(),
    ) = RegionalMediaRoutingService(
        environment,
        legacyMode,
        signalingMode,
        mediaMode,
        signalingUrl,
        sharedSecret,
        ttlSeconds,
        fixedClock,
        meterRegistry,
        if (environment == "dev") "https://dev.ops.honey.school/keycloak/realms/playsay"
        else "https://ops.honey.school/keycloak/realms/playsay",
    )
}
