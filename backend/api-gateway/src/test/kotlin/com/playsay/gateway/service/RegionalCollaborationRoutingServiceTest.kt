package com.playsay.gateway.service

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class RegionalCollaborationRoutingServiceTest {
    @Test
    fun `disabled production routing keeps every origin on direct school`() {
        val service = service(environment = "prod")
        service.validateConfiguration()

        assertEquals(directUrl, service.websocketUrlFor("https://online.honeyschool.ru"))
        assertEquals(directUrl, service.websocketUrlFor("https://online.honey.school"))
        assertEquals(directUrl, service.websocketUrlFor(null))
    }

    @Test
    fun `enabled production routing accepts only exact trusted rf origin`() {
        val service = enabledService()
        service.validateConfiguration()

        assertEquals(regionalUrl, service.websocketUrlFor("https://online.honeyschool.ru"))
        assertEquals(directUrl, service.websocketUrlFor("https://online.honey.school"))
        assertEquals(directUrl, service.websocketUrlFor("https://online.honeyschool.ru.evil.example"))
        assertEquals(directUrl, service.websocketUrlFor("://malformed"))
        assertEquals(directUrl, service.websocketUrlFor("HTTPS://ONLINE.HONEYSCHOOL.RU"))
        assertEquals(directUrl, service.websocketUrlFor(null))
    }

    @Test
    fun `dev rejects production collaboration endpoint`() {
        assertFailsWith<IllegalArgumentException> {
            enabledService(environment = "dev", directWebsocketUrl = "wss://dev.online.honey.school/collab/ws")
                .validateConfiguration()
        }
    }

    @Test
    fun `configuration rejects unknown modes and unsafe urls`() {
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", mode = "unexpected").validateConfiguration()
        }
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", directWebsocketUrl = "wss://online.honey.school/collab/ws?token=forbidden")
                .validateConfiguration()
        }
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", directWebsocketUrl = "wss://other.example/collab/ws")
                .validateConfiguration()
        }
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", regionalWebsocketUrl = "wss://other.example/collab/ws")
                .validateConfiguration()
        }
        assertFailsWith<IllegalArgumentException> {
            service(environment = "prod", mode = "rf-two-hop", regionalWebsocketUrl = "")
                .validateConfiguration()
        }
    }

    @Test
    fun `local and dev direct collaboration urls remain valid while routing is off`() {
        service(directWebsocketUrl = "/collab/ws", regionalWebsocketUrl = "").validateConfiguration()
        service(
            directWebsocketUrl = "wss://dev.online.honey.school/collab/ws",
            environment = "dev",
            regionalWebsocketUrl = "",
        ).validateConfiguration()
    }

    @Test
    fun `metrics expose only bounded route classes`() {
        val registry = SimpleMeterRegistry()
        val service = enabledService(meterRegistry = registry)

        service.websocketUrlFor("https://online.honey.school")
        service.websocketUrlFor("https://online.honeyschool.ru")

        val meters = registry.meters.filter {
            it.id.name == "playsay.classroom.collaboration.route.selections"
        }
        assertEquals(setOf("direct-school", "rf-two-hop"), meters.map { it.id.getTag("route") }.toSet())
        assertEquals(
            setOf("playsay.classroom.collaboration.route.selections", "route", "direct-school", "rf-two-hop"),
            meters.flatMap { meter ->
                listOf(meter.id.name) + meter.id.tags.flatMap { tag -> listOf(tag.key, tag.value) }
            }.toSet(),
        )
    }

    private fun enabledService(
        environment: String = "prod",
        directWebsocketUrl: String = directUrl,
        meterRegistry: SimpleMeterRegistry = SimpleMeterRegistry(),
    ): RegionalCollaborationRoutingService = service(
        directWebsocketUrl = directWebsocketUrl,
        environment = environment,
        mode = "rf-two-hop",
        regionalWebsocketUrl = regionalUrl,
        meterRegistry = meterRegistry,
    )

    private fun service(
        directWebsocketUrl: String = directUrl,
        environment: String = "local",
        mode: String = "off",
        regionalWebsocketUrl: String = regionalUrl,
        meterRegistry: SimpleMeterRegistry = SimpleMeterRegistry(),
    ): RegionalCollaborationRoutingService = RegionalCollaborationRoutingService(
        directWebsocketUrl,
        environment,
        mode,
        regionalWebsocketUrl,
        meterRegistry,
        if (environment == "dev") "https://dev.ops.honey.school/keycloak/realms/playsay"
        else "https://ops.honey.school/keycloak/realms/playsay",
    )

    companion object {
        private const val directUrl = "wss://online.honey.school/collab/ws"
        private const val regionalUrl = "wss://online.honeyschool.ru/collab/ws"
    }
}
