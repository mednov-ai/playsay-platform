package com.playsay.gateway.service

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.playsay.gateway.dto.RegionalRouteConnectionRole
import com.playsay.gateway.dto.RegionalRouteDiagnosticEventRequest
import com.playsay.gateway.dto.RegionalRouteDiagnosticOutcome
import com.playsay.gateway.dto.RegionalRouteDiagnosticStage
import com.playsay.gateway.dto.RegionalRouteTransportClass
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.slf4j.LoggerFactory
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.web.server.ResponseStatusException

class RegionalRouteDiagnosticServiceTest {
    @Test
    fun `records only bounded diagnostic dimensions`() {
        val meters = SimpleMeterRegistry()
        val service = RegionalRouteDiagnosticService(meters)
        val event = event()

        service.record("student-subject", event)

        assertEquals(
            1.0,
            meters.get("honey_school_regional_route_diagnostic_total")
                .tags(
                    "stage", "media",
                    "outcome", "success",
                    "connection_role", "publisher",
                    "transport_class", "turn_tls",
                    "regional_endpoint_matched", "true",
                ).counter().count(),
        )
        assertEquals(null, meters.find("student-subject").meter())
    }

    @Test
    fun `rate limits a subject without rejecting other subjects`() {
        val service = RegionalRouteDiagnosticService(SimpleMeterRegistry())
        repeat(120) { service.record("student-a", event()) }

        assertThrows<ResponseStatusException> { service.record("student-a", event()) }
        service.record("student-b", event())
    }

    @Test
    fun `correlation expires from first event and is isolated per subject`() {
        val clock = MutableClock()
        val service = RegionalRouteDiagnosticService(SimpleMeterRegistry(), clock)
        val logger = LoggerFactory.getLogger(RegionalRouteDiagnosticService::class.java) as Logger
        val output = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(output)
        try {
            val event = event()
            service.record("student-a", event)
            clock.now = clock.now.plusSeconds(14 * 60)
            service.record("student-a", event)
            service.record("student-b", event)
            clock.now = clock.now.plusSeconds(60)
            service.record("student-a", event)
            val ids = output.list.map { it.argumentArray[0] }
            assertEquals(ids[0], ids[1])
            assertNotEquals(ids[0], ids[2])
            assertNotEquals(ids[0], ids[3])
            assertNotEquals(event.attemptId, ids[0])
        } finally {
            logger.detachAppender(output)
            output.stop()
        }
    }

    @Test
    fun `rejects unrecognized diagnostic fields`() {
        val mapper = jacksonObjectMapper()
        val base = mapper.writeValueAsString(event()).dropLast(1)
        for (field in listOf("url", "token", "rawIp", "sdp", "participantId")) {
            assertThrows<com.fasterxml.jackson.databind.JsonMappingException> {
                mapper.readValue<RegionalRouteDiagnosticEventRequest>("$base,\"$field\":\"synthetic\"}")
            }
        }
    }

    private class MutableClock(var now: Instant = Instant.parse("2026-09-05T00:00:00Z")) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = this
        override fun instant(): Instant = now
    }

    private fun event() = RegionalRouteDiagnosticEventRequest(
        attemptId = UUID.randomUUID(),
        stage = RegionalRouteDiagnosticStage.MEDIA,
        outcome = RegionalRouteDiagnosticOutcome.SUCCESS,
        connectionRole = RegionalRouteConnectionRole.PUBLISHER,
        regionalEndpointMatched = true,
        transportClass = RegionalRouteTransportClass.TURN_TLS,
    )
}
