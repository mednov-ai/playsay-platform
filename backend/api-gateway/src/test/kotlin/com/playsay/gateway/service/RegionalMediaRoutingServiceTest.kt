package com.playsay.gateway.service

import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
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

        assertNull(service.routingFor("https://online.honeyschool.ru"))
        assertNull(service.routingFor("https://online.honey.school"))
    }

    @Test
    fun `enabled production routing accepts only exact trusted rf origin`() {
        val service = service(environment = "prod", mode = "rf-origin-relay", sharedSecret = secret)
        service.validateConfiguration()

        assertNull(service.routingFor("https://online.honey.school"))
        assertNull(service.routingFor("https://online.honeyschool.ru.evil.example"))
        assertNull(service.routingFor(null))

        val routing = requireNotNull(service.routingFor("https://online.honeyschool.ru"))
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

    private fun service(
        environment: String,
        mode: String,
        sharedSecret: String,
        ttlSeconds: Long = 900,
    ) = RegionalMediaRoutingService(environment, mode, sharedSecret, ttlSeconds, fixedClock)
}
