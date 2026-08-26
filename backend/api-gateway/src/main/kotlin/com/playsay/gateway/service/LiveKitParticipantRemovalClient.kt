package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.util.Date
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

interface LiveKitParticipantRemovalClient {
    fun remove(roomName: String, identity: String): Boolean
}

@Component
class HttpLiveKitParticipantRemovalClient(
    @param:Value("\${playsay.livekit.url:}") private val serverUrl: String,
    @param:Value("\${playsay.livekit.api-key:}") private val apiKey: String,
    @param:Value("\${playsay.livekit.api-secret:}") private val apiSecret: String,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val httpClient: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
) : LiveKitParticipantRemovalClient {
    override fun remove(roomName: String, identity: String): Boolean {
        if (roomName.isBlank() || identity.isBlank() || apiKey.isBlank() || apiSecret.toByteArray().size < 32) return false
        val endpoint = runCatching { apiEndpoint() }.getOrNull() ?: return false
        repeat(2) {
            if (removeOnce(endpoint, roomName, identity)) return true
        }
        return false
    }

    private fun removeOnce(endpoint: URI, roomName: String, identity: String): Boolean {
        val response = runCatching {
            httpClient.send(
                HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(2))
                    .header("Authorization", "Bearer ${adminToken(roomName)}")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(mapOf("room" to roomName, "identity" to identity))))
                    .build(),
                HttpResponse.BodyHandlers.discarding(),
            )
        }.getOrNull() ?: return false
        return response.statusCode() in 200..299 || response.statusCode() == 404
    }

    private fun apiEndpoint(): URI {
        val source = URI(serverUrl.trim())
        val scheme = if (source.scheme == "wss") "https" else if (source.scheme == "ws") "http" else source.scheme
        return URI("$scheme://${source.authority}/twirp/livekit.RoomService/RemoveParticipant")
    }

    private fun adminToken(roomName: String): String {
        val now = Instant.now()
        val claims = JWTClaimsSet.Builder()
            .issuer(apiKey.trim())
            .claim("video", mapOf("room" to roomName, "roomAdmin" to true))
            .notBeforeTime(Date.from(now.minusSeconds(5)))
            .expirationTime(Date.from(now.plusSeconds(60)))
            .build()
        return SignedJWT(JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(), claims).also { jwt ->
            jwt.sign(MACSigner(apiSecret.trim().toByteArray(StandardCharsets.UTF_8)))
        }.serialize()
    }
}
