package com.playsay.gateway.service

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.crypto.MACVerifier
import com.nimbusds.jwt.SignedJWT
import com.playsay.gateway.dto.LiveKitWebhookEvent
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.Date
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

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
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
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

        val lesson = lessonRepo.findByLivekitRoomName(roomName)
        if (lesson != null) {
            lesson.actualStart = lesson.actualStart ?: seenAt
            if (lesson.status == MetaData.LessonStatuses.SCHEDULED) {
                lesson.status = MetaData.LessonStatuses.IN_PROGRESS
            }
            lesson.updatedAt = seenAt
            lessonRepo.save(lesson)
        }

        val participant = lessonParticipantRepo.findByRoomNameAndStudentSubject(roomName, identity) ?: return
        participant.joinedAt = participant.joinedAt ?: seenAt
        if (participant.attendanceStatus == null || participant.attendanceStatus == MetaData.AttendanceStatuses.PLANNED) {
            participant.attendanceStatus = MetaData.AttendanceStatuses.PRESENT
        }
        lessonParticipantRepo.save(participant)
    }

    private fun recordParticipantLeft(event: LiveKitWebhookEvent) {
        val roomName = event.roomName() ?: return
        val identity = event.participantIdentity() ?: return
        val seenAt = event.seenAt()

        val participant = lessonParticipantRepo.findByRoomNameAndStudentSubject(roomName, identity) ?: return
        participant.leftAt = seenAt
        lessonParticipantRepo.save(participant)
    }
}

private fun LiveKitWebhookEvent.roomName(): String? =
    room?.name?.trim()?.takeIf { value -> value.isNotEmpty() }

private fun LiveKitWebhookEvent.participantIdentity(): String? =
    participant?.identity?.trim()?.takeIf { value -> value.isNotEmpty() }

private fun LiveKitWebhookEvent.seenAt(): Instant =
    createdAt?.let { value -> Instant.ofEpochSecond(value) } ?: Instant.now()
