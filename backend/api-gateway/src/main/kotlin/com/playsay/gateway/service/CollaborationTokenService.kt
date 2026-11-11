package com.playsay.gateway.service

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.playsay.gateway.dto.CollaborationTokenResponse
import com.playsay.gateway.entity.CollaborationDocumentEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.utils.requireSubject
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Date
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component

@Component
class CollaborationTokenService(
    @param:Value("\${playsay.collaboration.token-secret:}") private val tokenSecret: String,
    @param:Value("\${playsay.collaboration.token-ttl-seconds:900}") private val tokenTtlSeconds: Long,
    private val routingService: RegionalCollaborationRoutingService,
) {
    fun createToken(
        authentication: JwtAuthenticationToken,
        document: CollaborationDocumentEntity,
        origin: String?,
        canPublishMaterialViewport: Boolean,
        whiteboardId: UUID? = null,
        contentEpoch: Long? = null,
    ): CollaborationTokenResponse {
        val secretBytes = tokenSecret.trim().toByteArray(StandardCharsets.UTF_8)
        if (secretBytes.size < 32) {
            throw ProjectResponseException.localized(HttpStatus.SERVICE_UNAVAILABLE, MetaData.ErrorCodes.COLLABORATION_NOT_CONFIGURED)
        }
        val now = Instant.now()
        val expiresAt = now.plusSeconds(tokenTtlSeconds.coerceIn(60, 3_600))
        val claims = JWTClaimsSet.Builder()
            .issuer("playsay-api-gateway")
            .subject(authentication.token.requireSubject())
            .claim("documentId", document.id.toString())
            .claim("lessonId", document.lessonId.toString())
            .claim("materialId", document.materialId?.toString())
            .claim("whiteboardId", whiteboardId?.toString())
            .claim("contentEpoch", contentEpoch)
            .claim("gameLaunchId", document.gameLaunchId?.toString())
            .claim("studentUserId", document.studentUserId?.toString())
            .claim("documentKind", document.documentKind)
            .claim("scope", document.collaborationScope)
            .claim("yjsDocumentId", document.yjsDocumentId)
            .claim("room", document.yjsDocumentId)
            .claim("canPublishMaterialViewport", canPublishMaterialViewport)
            .notBeforeTime(Date.from(now.minusSeconds(5)))
            .expirationTime(Date.from(expiresAt))
            .build()
        val jwt = SignedJWT(
            JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(),
            claims,
        )
        jwt.sign(MACSigner(secretBytes))

        return CollaborationTokenResponse(
            documentId = document.id,
            yjsDocumentId = document.yjsDocumentId,
            websocketUrl = routingService.websocketUrlFor(origin),
            token = jwt.serialize(),
            expiresAt = expiresAt,
        )
    }
}
