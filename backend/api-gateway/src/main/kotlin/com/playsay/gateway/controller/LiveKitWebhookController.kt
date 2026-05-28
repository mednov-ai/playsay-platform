package com.playsay.gateway.controller

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.crypto.MACVerifier
import com.nimbusds.jwt.SignedJWT
import io.swagger.v3.oas.annotations.Hidden
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.Date
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*

@Hidden
@RestController
class LiveKitWebhookController(
    private val verifier: LiveKitWebhookVerifier,
    private val attendanceStore: LiveKitWebhookAttendanceStore,
) {
    private val objectMapper = jacksonObjectMapper()
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    @PostMapping(
        "/livekit/webhook",
        consumes = ["application/webhook+json", MediaType.APPLICATION_JSON_VALUE],
    )
    fun receive(
        @RequestBody rawBody: String,
        @RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorizationHeader: String?,
    ): ResponseEntity<Void> {
        verifier.verify(rawBody, authorizationHeader)
        attendanceStore.record(objectMapper.readValue(rawBody, LiveKitWebhookEvent::class.java))
        return ResponseEntity.noContent().build()
    }
}
