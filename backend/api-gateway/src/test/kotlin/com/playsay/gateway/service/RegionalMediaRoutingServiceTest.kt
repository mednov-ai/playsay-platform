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
        val service = service(environment = "prod", mode = "off", sharedSecret = "")
        service.validateConfiguration()

        assertNull(service.selectionFor("https://online.honeyschool.ru"))
        assertNull(service.selectionFor("https://online.honey.school"))
    }

    @Test
    fun `enabled production routing accepts only exact trusted rf origin`() {
        val service = service(environment = "prod", mode = "rf-origin-relay", sharedSecret = secret)
        service.validateConfiguration()

        assertNull(service.selectionFor("https://online.honey.school"))
        assertNull(service.selectionFor("https://online.honeyschool.ru.evil.example"))
        assertNull(service.selectionFor(null))

        val selection = requireNotNull(service.selectionFor("https://online.honeyschool.ru"))
        assertEquals("wss://online.honeyschool.ru/livekit", selection.serverUrl)
        val routing = selection.mediaRouting
        assertEquals("REGIONAL_RELAY", routing.policy)
        assertEquals("selectel-rf-v1", routing.revision)
        assertEquals("relay", routing.iceTransportPolicy)
        assertEquals(Instant.parse("2026-08-31T10:15:00Z"), routing.expiresAt)
        assertEquals(3, routing.iceServers.single().urls.size)
        assertTrue(routing.iceServers.single().username.startsWith("1788171300:"))
        assertTrue(routing.iceServers.single().credential.isNotBlank())
    }

    @Test
    fun `enabled routing fails closed outside production`() {
        val service = service(environment = "dev", mode = "rf-origin-relay", sharedSecret = secret)
        assertFailsWith<IllegalArgumentException> { service.validateConfiguration() }
    }

    @Test
    fun `enabled routing rejects malformed mode secret and ttl`() {
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", mode = "unexpected", sharedSecret = secret).validateConfiguration()
        }
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", mode = "rf-origin-relay", sharedSecret = "short").validateConfiguration()
        }
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", mode = "rf-origin-relay", sharedSecret = secret, ttlSeconds = 901).validateConfiguration()
        }
    }

    @Test
    fun `enabled routing rejects missing or non allowlisted signaling url without echoing it`() {
        val missing = assertFailsWith<IllegalArgumentException> {
            service(
                environment = "prod",
                mode = "rf-origin-relay",
                sharedSecret = secret,
                signalingUrl = "",
            ).validateConfiguration()
        }
        assertEquals("Regional classroom signaling URL is invalid", missing.message)

        val supplied = "wss://online.honey.school/livekit?access_token=prohibited"
        val untrusted = assertFailsWith<IllegalArgumentException> {
            service(
                environment = "prod",
                mode = "rf-origin-relay",
                sharedSecret = secret,
                signalingUrl = supplied,
            ).validateConfiguration()
        }
        assertEquals("Regional classroom signaling URL is invalid", untrusted.message)
        assertFalse(untrusted.message.orEmpty().contains(supplied))
    }

    @Test
    fun `route metrics expose only bounded contour classes`() {
        val registry = SimpleMeterRegistry()
        val service = service(
            environment = "prod",
            mode = "rf-origin-relay",
            sharedSecret = secret,
            meterRegistry = registry,
        )

        service.selectionFor("https://online.honey.school")
        val selection = requireNotNull(service.selectionFor("https://online.honeyschool.ru"))

        val meters = registry.meters.filter { it.id.name == "playsay.classroom.route.selections" }
        assertEquals(setOf("direct-school", "rf-two-hop"), meters.map { it.id.getTag("route") }.toSet())
        val exposedMetadata = meters.flatMap { meter ->
            listOf(meter.id.name) + meter.id.tags.flatMap { tag -> listOf(tag.key, tag.value) }
        }.joinToString(" ")
        listOf(
            selection.serverUrl,
            selection.mediaRouting.iceServers.single().username,
            selection.mediaRouting.iceServers.single().credential,
            "https://online.honey.school",
        ).forEach { sensitiveValue -> assertFalse(exposedMetadata.contains(sensitiveValue)) }
    }

    private fun service(
        environment: String,
        mode: String,
        sharedSecret: String,
        ttlSeconds: Long = 900,
        signalingUrl: String = "wss://online.honeyschool.ru/livekit",
        meterRegistry: SimpleMeterRegistry = SimpleMeterRegistry(),
    ) = RegionalMediaRoutingService(environment, mode, signalingUrl, sharedSecret, ttlSeconds, fixedClock, meterRegistry)
}
