package com.playsay.gateway

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.nio.charset.StandardCharsets
import java.sql.ResultSet
import java.time.Instant
import java.util.Date
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class LiveKitRoomTokenResponse(
    val serverUrl: String,
    val token: String,
    val roomName: String,
    val identity: String,
    val expiresAt: Instant,
)

private data class LiveKitLesson(
    val id: UUID,
    val roomName: String?,
)

@Component
class LiveKitTokenService(
    @param:Value("\${playsay.livekit.url:}") private val serverUrl: String,
    @param:Value("\${playsay.livekit.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.livekit.api-secret:}") private val apiSecret: String,
    @param:Value("\${playsay.livekit.token-ttl-seconds:3600}") private val tokenTtlSeconds: Long,
) {
    fun createToken(authentication: JwtAuthenticationToken, roomName: String): LiveKitRoomTokenResponse {
        val cleanServerUrl = serverUrl.trim()
        val cleanApiKey = apiKey.trim()
        val cleanApiSecret = apiSecret.trim()
        val secretBytes = cleanApiSecret.toByteArray(StandardCharsets.UTF_8)
        if (cleanServerUrl.isEmpty() || cleanApiKey.isEmpty() || secretBytes.size < 32) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "LiveKit is not configured.")
        }

        val now = Instant.now()
        val expiresAt = now.plusSeconds(tokenTtlSeconds.coerceIn(60, 86_400))
        val identity = authentication.token.subject
        val displayName = authentication.token.getClaimAsString("name")
            ?: authentication.token.getClaimAsString("preferred_username")
            ?: identity

        val claims = JWTClaimsSet.Builder()
            .issuer(cleanApiKey)
            .subject(identity)
            .claim("name", displayName)
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
        )
    }
}

@Component
class LiveKitRoomStore(
    private val jdbcClient: JdbcClient,
    private val tokenService: LiveKitTokenService,
) {
    @Transactional
    fun createToken(authentication: JwtAuthenticationToken, lessonId: UUID): LiveKitRoomTokenResponse {
        val lesson = findJoinableLesson(authentication, lessonId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled lesson not found.")
        val roomName = lesson.roomName?.trim()?.takeIf { room -> room.isNotEmpty() }
            ?: ensureRoomName(lesson.id)

        return tokenService.createToken(authentication, roomName)
    }

    private fun findJoinableLesson(authentication: JwtAuthenticationToken, lessonId: UUID): LiveKitLesson? {
        val whereClause = if (authentication.canJoinAnyLiveKitLesson()) {
            """
            WHERE l.id = :lessonId
              AND l.status NOT IN ('CANCELLED', 'COMPLETED')
              AND (l.scheduled_end IS NULL OR l.scheduled_end > :now)
            """.trimIndent()
        } else {
            """
            WHERE l.id = :lessonId
              AND l.status NOT IN ('CANCELLED', 'COMPLETED')
              AND (l.scheduled_end IS NULL OR l.scheduled_end > :now)
              AND EXISTS (
                  SELECT 1
                    FROM lesson_participant lp
                    JOIN app_user student ON student.id = lp.student_user_id
                   WHERE lp.lesson_id = l.id
                     AND student.keycloak_subject = :subject
              )
            """.trimIndent()
        }

        val params = mutableMapOf<String, Any?>(
            "lessonId" to lessonId,
            "now" to Instant.now().atOffset(java.time.ZoneOffset.UTC),
        )
        if (!authentication.canJoinAnyLiveKitLesson()) {
            params["subject"] = authentication.token.subject
        }

        return jdbcClient.sql(
            """
            SELECT l.id,
                   l.livekit_room_name
              FROM lesson l
              $whereClause
            """.trimIndent(),
        )
            .params(params)
            .query(::mapLiveKitLesson)
            .optional()
            .orElse(null)
    }

    private fun ensureRoomName(lessonId: UUID): String {
        val roomName = "lesson-$lessonId"
        jdbcClient.sql(
            """
            UPDATE lesson
               SET livekit_room_name = :roomName,
                   updated_at = :updatedAt
             WHERE id = :lessonId
            """.trimIndent(),
        )
            .param("lessonId", lessonId)
            .param("roomName", roomName)
            .param("updatedAt", Instant.now().atOffset(java.time.ZoneOffset.UTC))
            .update()
        return roomName
    }
}

@RestController
@Tag(name = "Schedule")
class LiveKitRoomController(
    private val store: LiveKitRoomStore,
) {
    @PostMapping(
        "/schedule/lessons/{lessonId}/room-token",
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createScheduledLessonRoomToken",
        summary = "Create scheduled lesson video token",
        description = "Returns a short-lived LiveKit join token for a scheduled lesson visible to the current user.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "LiveKit room token"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson not found", content = [Content()]),
            ApiResponse(responseCode = "503", description = "LiveKit is not configured", content = [Content()]),
        ],
    )
    fun createToken(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): LiveKitRoomTokenResponse =
        store.createToken(authentication, lessonId)
}

private fun JwtAuthenticationToken.canJoinAnyLiveKitLesson(): Boolean =
    authorities.any { authority -> authority.authority == "ROLE_TEACHER" || authority.authority == "ROLE_ADMIN" }

private fun mapLiveKitLesson(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): LiveKitLesson =
    LiveKitLesson(
        id = rs.getObject("id", UUID::class.java),
        roomName = rs.getString("livekit_room_name"),
    )
