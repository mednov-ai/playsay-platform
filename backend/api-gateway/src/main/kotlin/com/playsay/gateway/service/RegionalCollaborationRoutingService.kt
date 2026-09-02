package com.playsay.gateway.service

import io.micrometer.core.instrument.MeterRegistry
import jakarta.annotation.PostConstruct
import java.net.URI
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class RegionalCollaborationRoutingService(
    @param:Value("\${playsay.collaboration.websocket-url:/collab/ws}") private val directWebsocketUrl: String,
    @param:Value("\${playsay.collaboration.regional-routing.environment:local}") private val environment: String,
    @param:Value("\${playsay.collaboration.regional-routing.mode:off}") private val mode: String,
    @param:Value("\${playsay.collaboration.regional-routing.websocket-url:}") private val regionalWebsocketUrl: String,
    private val meterRegistry: MeterRegistry,
) {
    @PostConstruct
    fun validateConfiguration() {
        require(environment in supportedEnvironments) { "Unsupported collaboration routing environment" }
        require(mode in supportedModes) { "Unsupported regional collaboration routing mode" }

        val directUrl = directWebsocketUrl.trim()
        require(isSafeDirectUrl(directUrl)) { "Direct collaboration WebSocket URL is invalid" }
        if (environment == productionEnvironment) {
            require(directUrl == productionDirectUrl) { "Production collaboration WebSocket URL is invalid" }
        }

        val regionalUrl = regionalWebsocketUrl.trim()
        require(regionalUrl.isEmpty() || regionalUrl == trustedRegionalUrl) {
            "Regional collaboration WebSocket URL is invalid"
        }
        if (mode == regionalMode) {
            require(environment == productionEnvironment) {
                "Regional collaboration routing can be enabled only in production"
            }
            require(regionalUrl == trustedRegionalUrl) { "Regional collaboration WebSocket URL is invalid" }
        }
    }

    fun websocketUrlFor(origin: String?): String {
        val regionalSelected = environment == productionEnvironment &&
            mode == regionalMode &&
            origin == trustedRegionalOrigin
        val route = if (regionalSelected) regionalRouteClass else directRouteClass
        meterRegistry.counter(routeSelectionMetric, routeTag, route).increment()
        return if (regionalSelected) trustedRegionalUrl else directWebsocketUrl.trim()
    }

    private fun isSafeDirectUrl(value: String): Boolean {
        if (value == relativeDirectUrl) return true
        val parsed = runCatching { URI(value) }.getOrNull() ?: return false
        return parsed.scheme == "wss" &&
            !parsed.host.isNullOrBlank() &&
            parsed.path == collaborationPath &&
            parsed.userInfo == null &&
            parsed.query == null &&
            parsed.fragment == null
    }

    companion object {
        private const val productionEnvironment = "prod"
        private const val regionalMode = "rf-two-hop"
        private const val trustedRegionalOrigin = "https://online.honeyschool.ru"
        private const val trustedRegionalUrl = "wss://online.honeyschool.ru/collab/ws"
        private const val productionDirectUrl = "wss://online.honey.school/collab/ws"
        private const val relativeDirectUrl = "/collab/ws"
        private const val collaborationPath = "/collab/ws"
        private const val routeSelectionMetric = "playsay.classroom.collaboration.route.selections"
        private const val routeTag = "route"
        private const val directRouteClass = "direct-school"
        private const val regionalRouteClass = "rf-two-hop"
        private val supportedEnvironments = setOf("local", "dev", productionEnvironment)
        private val supportedModes = setOf("off", regionalMode)
    }
}
