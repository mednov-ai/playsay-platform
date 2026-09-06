package com.playsay.gateway.service

import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.time.Clock
import java.util.function.Supplier
import org.junit.jupiter.api.Test
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.core.io.ClassPathResource
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class RegionalMediaRoutingBindingTest {
    @Test
    fun `rendered candidate helm settings drive real selector when supplied`() {
        val matrix = System.getenv("REGIONAL_ROUTING_HELM_MATRIX") ?: return
        val rows = matrix.lines().map { it.split('|') }
        assertEquals(listOf("prod", "dev", "rollback"), rows.map { it[0] })
        rows.forEach { row ->
            assertEquals(6, row.size)
            runner(row[3], row[4], row[1]).withPropertyValues(
                "PLAYSAY_REGIONAL_RELAY_MODE=${row[2]}",
                "PLAYSAY_REGIONAL_RELAY_SIGNALING_URL=${row[5]}",
            ).run { context ->
                assertNull(context.startupFailure)
                val selected = context.getBean(RegionalMediaRoutingService::class.java)
                    .selectionFor("https://online.honeyschool.ru")
                if (row[0] == "dev") {
                    assertNull(selected)
                } else {
                    assertEquals("wss://online.honeyschool.ru/livekit", assertNotNull(selected).serverUrl)
                    if (row[0] == "prod") {
                        assertEquals("relay", assertNotNull(selected.mediaRouting).iceTransportPolicy)
                    } else {
                        assertNull(selected.mediaRouting)
                    }
                }
            }
        }
    }

    private fun runner(signaling: String, media: String, environment: String = "prod") = ApplicationContextRunner()
        .withInitializer { context ->
            YamlPropertySourceLoader().load("application", ClassPathResource("application.yaml"))
                .forEach { context.environment.propertySources.addLast(it) }
        }
        .withBean(Clock::class.java, Supplier { Clock.systemUTC() })
        .withBean(MeterRegistry::class.java, Supplier { SimpleMeterRegistry() })
        .withUserConfiguration(RegionalMediaRoutingService::class.java)
        .withPropertyValues(
            "PLAYSAY_AUTH_ISSUER_URI=https://${if (environment == "dev") "dev." else ""}ops.honey.school/keycloak/realms/playsay",
            "PLAYSAY_REGIONAL_RELAY_ENVIRONMENT=$environment",
            "PLAYSAY_REGIONAL_RELAY_MODE=off",
            "PLAYSAY_REGIONAL_SIGNALING_MODE=$signaling",
            "PLAYSAY_REGIONAL_MEDIA_MODE=$media",
            "PLAYSAY_REGIONAL_RELAY_SIGNALING_URL=wss://online.honeyschool.ru/livekit",
            "PLAYSAY_REGIONAL_RELAY_SHARED_SECRET=${"a".repeat(64)}",
        )

    @Test
    fun `actual yaml binds independent environment controls with legacy off`() {
        runner("rf-two-hop", "rf-turn-relay").run { context ->
            assertNull(context.startupFailure)
            val service = context.getBean(RegionalMediaRoutingService::class.java)
            val selected = assertNotNull(service.selectionFor("https://online.honeyschool.ru"))
            assertEquals("wss://online.honeyschool.ru/livekit", selected.serverUrl)
            assertEquals("relay", assertNotNull(selected.mediaRouting).iceTransportPolicy)
            listOf(null, "https://online.honey.school", "https://online.honeyschool.ru.evil.example")
                .forEach { assertNull(service.selectionFor(it)) }
        }
    }

    @Test
    fun `media rollback retains signaling with no secret`() {
        runner("rf-two-hop", "off").withPropertyValues("PLAYSAY_REGIONAL_RELAY_SHARED_SECRET=").run { context ->
            assertNull(context.startupFailure)
            val selected = assertNotNull(context.getBean(RegionalMediaRoutingService::class.java)
                .selectionFor("https://online.honeyschool.ru"))
            assertEquals("wss://online.honeyschool.ru/livekit", selected.serverUrl)
            assertNull(selected.mediaRouting)
        }
    }

    @Test
    fun `dev baseline remains direct`() {
        runner("off", "off", "dev").run { context ->
            assertNull(context.startupFailure)
            assertNull(context.getBean(RegionalMediaRoutingService::class.java)
                .selectionFor("https://online.honeyschool.ru"))
        }
    }

    @Test
    fun `dev yaml uses its own issuer signaling and relay endpoints`() {
        runner("rf-two-hop", "rf-turn-relay", "dev").withPropertyValues(
            "PLAYSAY_REGIONAL_RELAY_SIGNALING_URL=wss://dev.online.honeyschool.ru/livekit",
        ).run { context ->
            assertNull(context.startupFailure)
            val service = context.getBean(RegionalMediaRoutingService::class.java)
            val selected = assertNotNull(service.selectionFor("https://dev.online.honeyschool.ru"))
            assertEquals("wss://dev.online.honeyschool.ru/livekit", selected.serverUrl)
            assertEquals(
                "turn:dev.turn.honeyschool.ru:3479?transport=udp",
                assertNotNull(selected.mediaRouting).iceServers.single().urls.first(),
            )
            assertNull(service.selectionFor("https://online.honeyschool.ru"))
        }
    }

    @Test
    fun `dev yaml rejects production issuer even with dev endpoints`() {
        runner("rf-two-hop", "rf-turn-relay", "dev").withPropertyValues(
            "PLAYSAY_REGIONAL_RELAY_SIGNALING_URL=wss://dev.online.honeyschool.ru/livekit",
            "PLAYSAY_AUTH_ISSUER_URI=https://ops.honey.school/keycloak/realms/playsay",
        ).run { context -> assertNotNull(context.startupFailure) }
    }

    @Test
    fun `explicit off overrides legacy signaling compatibility`() {
        runner("off", "off").withPropertyValues("PLAYSAY_REGIONAL_RELAY_MODE=rf-origin-relay").run { context ->
            assertNull(context.startupFailure)
            assertNull(context.getBean(RegionalMediaRoutingService::class.java)
                .selectionFor("https://online.honeyschool.ru"))
        }
    }

    @Test
    fun `media without signaling is rejected by actual binding`() {
        runner("off", "rf-turn-relay").run { context -> assertNotNull(context.startupFailure) }
    }
}
