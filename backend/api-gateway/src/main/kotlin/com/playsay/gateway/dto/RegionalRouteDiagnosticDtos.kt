package com.playsay.gateway.dto

import com.fasterxml.jackson.annotation.JsonAnySetter
import java.util.UUID

enum class RegionalRouteDiagnosticStage { ENTRY, AUTH, POLICY, SIGNALING, ICE, MEDIA }

enum class RegionalRouteDiagnosticOutcome { STARTED, SUCCESS, FAILURE, UNAVAILABLE }

enum class RegionalRouteConnectionRole { PUBLISHER, SUBSCRIBER, NONE }

enum class RegionalRouteTransportClass { DIRECT, TURN_UDP, TURN_TCP, TURN_TLS, UNKNOWN }

data class RegionalRouteDiagnosticEventRequest(
    val attemptId: UUID,
    val stage: RegionalRouteDiagnosticStage,
    val outcome: RegionalRouteDiagnosticOutcome,
    val connectionRole: RegionalRouteConnectionRole = RegionalRouteConnectionRole.NONE,
    val regionalEndpointMatched: Boolean? = null,
    val transportClass: RegionalRouteTransportClass = RegionalRouteTransportClass.UNKNOWN,
) {
    @JsonAnySetter
    @Suppress("UNUSED_PARAMETER")
    fun rejectUnknownField(name: String, value: Any?) {
        throw IllegalArgumentException("Unsupported diagnostic field")
    }
}
