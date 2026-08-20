package com.playsay.gateway.service

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.playsay.gateway.dto.LiveKitRoomTokenResponse
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.StudentProfileRepo
import com.playsay.gateway.utils.MetaData
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Date
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class LiveKitTokenService(
    @param:Value("\${playsay.livekit.url:}") private val serverUrl: String,
    @param:Value("\${playsay.livekit.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.livekit.api-secret:}") private val apiSecret: String,
    @param:Value("\${playsay.livekit.token-ttl-seconds:3600}") private val tokenTtlSeconds: Long,
) {
    fun createToken(
        authentication: JwtAuthenticationToken,
        roomName: String,
        lessonTranslationAllowed: Boolean = false,
    ): LiveKitRoomTokenResponse {
        val cleanServerUrl = serverUrl.trim()
        val cleanApiKey = apiKey.trim()
        val cleanApiSecret = apiSecret.trim()
        val secretBytes = cleanApiSecret.toByteArray(StandardCharsets.UTF_8)
        if (cleanServerUrl.isEmpty() || cleanApiKey.isEmpty() || secretBytes.size < 32) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.LIVEKIT_NOT_CONFIGURED)
        }

        val now = Instant.now()
        val expiresAt = now.plusSeconds(tokenTtlSeconds.coerceIn(60, 86_400))
        val identity = authentication.token.subject
        val displayName = authentication.token.getClaimAsString("name")
            ?: authentication.token.getClaimAsString("preferred_username")
            ?: identity
        val playsayRole = when {
            authentication.authorities.any { it.authority == MetaData.Authorities.ADMIN } -> MetaData.Roles.ADMIN
            authentication.authorities.any { it.authority == MetaData.Authorities.TEACHER } -> MetaData.Roles.TEACHER
            else -> MetaData.Roles.STUDENT
        }

        val claims = JWTClaimsSet.Builder()
            .issuer(cleanApiKey)
            .subject(identity)
            .claim("name", displayName)
            .claim("metadata", """{"playsayRole":"$playsayRole"}""")
            .claim(
                "video",
                mapOf(
                    "room" to roomName,
                    "roomJoin" to true,
                    "canPublish" to true,
                    "canSubscribe" to true,
                    "canPublishData" to true,
                ),
            )
            .notBeforeTime(Date.from(now.minusSeconds(5)))
            .expirationTime(Date.from(expiresAt))
            .build()

        val signedJwt = SignedJWT(
            JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(),
            claims,
        )
        signedJwt.sign(MACSigner(secretBytes))

        return LiveKitRoomTokenResponse(
            serverUrl = cleanServerUrl,
            token = signedJwt.serialize(),
            roomName = roomName,
            identity = identity,
            expiresAt = expiresAt,
            lessonTranslationAllowed = lessonTranslationAllowed,
        )
    }
}

@Component
class LiveKitRoomStore(
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val studentProfileRepo: StudentProfileRepo,
    private val authorizationService: ScheduledLessonAuthorizationService,
    private val tokenService: LiveKitTokenService,
) {
    @Transactional
    fun createToken(authentication: JwtAuthenticationToken, lessonId: UUID): LiveKitRoomTokenResponse {
        val lesson = findJoinableLesson(authentication, lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        val roomName = lesson.livekitRoomName?.trim()?.takeIf { room -> room.isNotEmpty() }
            ?: ensureRoomName(lesson)

        return tokenService.createToken(authentication, roomName, lessonTranslationAllowed(lesson))
    }

    private fun lessonTranslationAllowed(lesson: LessonEntity): Boolean {
        if (lesson.type != MetaData.LessonTypes.INDIVIDUAL) return false
        val participant = lessonParticipantRepo.findParticipantRowsByLessonIds(listOf(lesson.id)).singleOrNull()
            ?: return false
        return studentProfileRepo.findByUserId(participant.userId)?.lessonTranslationAllowed == true
    }

    private fun findJoinableLesson(authentication: JwtAuthenticationToken, lessonId: UUID): LessonEntity? {
        val now = Instant.now()
        return if (authentication.canJoinAnyLiveKitLesson()) {
            val lesson = lessonRepo.findById(lessonId).orElse(null)
                ?.takeIf { authorizationService.canManageLesson(authentication, lessonId) }
                ?: return null
            if (
                lesson.status != MetaData.LessonStatuses.IN_PROGRESS ||
                !isLessonInsideAccessWindow(lesson.status, lesson.scheduledStart, lesson.scheduledEnd, now, expiredLiveKitStatuses)
            ) {
                throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.SCHEDULED_LESSON_OUTSIDE_ACCESS_WINDOW)
            }
            lesson
        } else {
            lessonRepo.findJoinableForStudent(
                lessonId = lessonId,
                subject = authentication.token.subject,
                accessStartsBy = lessonAccessStartsBy(now),
                accessEndsAfter = lessonAccessEndsAfter(now),
                requiredStatus = MetaData.LessonStatuses.IN_PROGRESS,
            )
        }
    }

    private fun ensureRoomName(lesson: LessonEntity): String {
        val roomName = "lesson-${lesson.id}"
        lesson.livekitRoomName = roomName
        lesson.updatedAt = Instant.now()
        lessonRepo.save(lesson)
        return roomName
    }
}

private fun JwtAuthenticationToken.canJoinAnyLiveKitLesson(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN }

private val expiredLiveKitStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
