package com.playsay.gateway.controller

import com.playsay.gateway.service.LiveKitWebhookAttendanceStore
import com.playsay.gateway.service.LiveKitWebhookEventParser
import com.playsay.gateway.service.LiveKitWebhookVerifier
import io.swagger.v3.oas.annotations.Hidden
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@Hidden
@RestController
class LiveKitWebhookController(
    private val verifier: LiveKitWebhookVerifier,
    private val eventParser: LiveKitWebhookEventParser,
    private val attendanceStore: LiveKitWebhookAttendanceStore,
) {
    @PostMapping(
        "/livekit/webhook",
        consumes = ["application/webhook+json", MediaType.APPLICATION_JSON_VALUE],
    )
    fun receive(
        @RequestBody rawBody: String,
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorizationHeader: String?,
    ): ResponseEntity<Void> {
        verifier.verify(rawBody, authorizationHeader)
        attendanceStore.record(eventParser.parse(rawBody))
        return ResponseEntity.noContent().build()
    }
}
