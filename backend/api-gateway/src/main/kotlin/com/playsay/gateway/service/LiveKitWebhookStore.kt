package com.playsay.gateway.service

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
import com.playsay.gateway.repo.LegacyJdbcDataRepo
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import com.playsay.gateway.dto.*
import com.playsay.gateway.error.ProjectResponseException

@Component
class LiveKitWebhookVerifier(
    @param:Value("\${playsay.livekit.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.livekit.api-secret:}") private val apiSecret: String,
) {
    fun verify(rawBody: String, authorizationHeader: String?) {
        val cleanApiKey = apiKey.trim()
        val secretBytes = apiSecret.trim().toByteArray(StandardCharsets.UTF_8)
        if (cleanApiKey.isEmpty() || secretBytes.size < 32) {
            throw ProjectResponseException(HttpStatus.SERVICE_UNAVAILABLE, "LiveKit is not configured.")
        }

        val token = authorizationHeader
            ?.trim()
            ?.removePrefix("Bearer ")
            ?.trim()
            ?.takeIf { value -> value.isNotEmpty() }
            ?: throw ProjectResponseException(HttpStatus.UNAUTHORIZED, "Missing LiveKit webhook signature.")

        val jwt = runCatching { SignedJWT.parse(token) }
            .getOrElse { throw ProjectResponseException(HttpStatus.UNAUTHORIZED, "Invalid LiveKit webhook signature.") }

        if (jwt.header.algorithm != JWSAlgorithm.HS256 || !jwt.verify(MACVerifier(secretBytes))) {
            throw ProjectResponseException(HttpStatus.UNAUTHORIZED, "Invalid LiveKit webhook signature.")
        }

        val claims = jwt.jwtClaimsSet
        if (claims.issuer != cleanApiKey) {
            throw ProjectResponseException(HttpStatus.UNAUTHORIZED, "Invalid LiveKit webhook issuer.")
        }
        val now = Date()
        if (claims.expirationTime?.after(now) != true || claims.notBeforeTime?.after(now) == true) {
            throw ProjectResponseException(HttpStatus.UNAUTHORIZED, "Expired LiveKit webhook signature.")
        }

        val expectedHash = claims.getStringClaim("sha256")
            ?: throw ProjectResponseException(HttpStatus.UNAUTHORIZED, "Missing LiveKit webhook payload hash.")
        val actualHash = MessageDigest.getInstance("SHA-256").digest(rawBody.toByteArray(StandardCharsets.UTF_8))
        val expectedHashBytes = runCatching { Base64.getDecoder().decode(expectedHash) }
            .getOrElse { throw ProjectResponseException(HttpStatus.UNAUTHORIZED, "Invalid LiveKit webhook payload hash.") }

        if (!MessageDigest.isEqual(actualHash, expectedHashBytes)) {
            throw ProjectResponseException(HttpStatus.UNAUTHORIZED, "Invalid LiveKit webhook payload hash.")
        }
    }
}

@Component
class LiveKitWebhookAttendanceStore(
    private val dataRepo: LegacyJdbcDataRepo,
) {
    @Transactional
    fun record(event: LiveKitWebhookEvent) {
        when (event.event) {
            "participant_joined" -> recordParticipantJoined(event)
            "participant_left" -> recordParticipantLeft(event)
        }
    }

    private fun recordParticipantJoined(event: LiveKitWebhookEvent) {
        val roomName = event.roomName() ?: return
        val identity = event.participantIdentity() ?: return
        val seenAt = event.seenAt()

        dataRepo.sql(
            """
            UPDATE lesson
               SET actual_start = COALESCE(actual_start, :seenAt),
                   status = CASE WHEN status = 'SCHEDULED' THEN 'IN_PROGRESS' ELSE status END,
                   updated_at = :seenAt
             WHERE livekit_room_name = :roomName
            """.trimIndent(),
        )
            .param("seenAt", seenAt.toOffsetDateTime())
            .param("roomName", roomName)
            .update()

        dataRepo.sql(
            """
            UPDATE lesson_participant lp
               SET joined_at = COALESCE(lp.joined_at, :seenAt),
                   attendance_status = CASE
                       WHEN lp.attendance_status IS NULL OR lp.attendance_status = 'PLANNED' THEN 'PRESENT'
                       ELSE lp.attendance_status
                   END
             WHERE lp.lesson_id = (
                   SELECT l.id
                     FROM lesson l
                    WHERE l.livekit_room_name = :roomName
             )
               AND lp.student_user_id = (
                   SELECT student.id
                     FROM app_user student
                    WHERE student.keycloak_subject = :identity
             )
            """.trimIndent(),
        )
            .param("seenAt", seenAt.toOffsetDateTime())
            .param("roomName", roomName)
            .param("identity", identity)
            .update()
    }

    private fun recordParticipantLeft(event: LiveKitWebhookEvent) {
        val roomName = event.roomName() ?: return
        val identity = event.participantIdentity() ?: return
        val seenAt = event.seenAt()

        dataRepo.sql(
            """
            UPDATE lesson_participant lp
               SET left_at = :seenAt
             WHERE lp.lesson_id = (
                   SELECT l.id
                     FROM lesson l
                    WHERE l.livekit_room_name = :roomName
             )
               AND lp.student_user_id = (
                   SELECT student.id
                     FROM app_user student
                    WHERE student.keycloak_subject = :identity
             )
            """.trimIndent(),
        )
            .param("seenAt", seenAt.toOffsetDateTime())
            .param("roomName", roomName)
            .param("identity", identity)
            .update()
    }
}

private fun LiveKitWebhookEvent.roomName(): String? =
    room?.name?.trim()?.takeIf { value -> value.isNotEmpty() }

private fun LiveKitWebhookEvent.participantIdentity(): String? =
    participant?.identity?.trim()?.takeIf { value -> value.isNotEmpty() }

private fun LiveKitWebhookEvent.seenAt(): Instant =
    createdAt?.let { value -> Instant.ofEpochSecond(value) } ?: Instant.now()

private fun Instant.toOffsetDateTime(): OffsetDateTime =
    atOffset(ZoneOffset.UTC)
