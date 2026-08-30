package com.playsay.gateway.service

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service

@Service
class LessonAccessTokenService(
    @Value("\${playsay.lesson-access.hmac-secret-base64:}") secretBase64: String,
    @param:Value("\${playsay.lesson-access.environment-issuer:}") private val environmentIssuer: String,
    @param:Value("\${playsay.lesson-access.hmac-key-version:1}") val keyVersion: Int,
) {
    private val secret = decodeSecret(secretBase64)

    fun derive(lessonId: UUID, revision: Long, requestedKeyVersion: Int = keyVersion): String {
        return deriveCapability(FULL_TOKEN_PROTOCOL, lessonId, revision, requestedKeyVersion)
    }

    fun deriveAlias(lessonId: UUID, revision: Long, requestedKeyVersion: Int = keyVersion): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(
            deriveCapabilityBytes(ALIAS_PROTOCOL, lessonId, revision, requestedKeyVersion).copyOf(ALIAS_BYTES),
        )

    fun matchesAlias(alias: String, lessonId: UUID, revision: Long, requestedKeyVersion: Int): Boolean {
        val expected = try {
            deriveAlias(lessonId, revision, requestedKeyVersion)
        } catch (_: IllegalArgumentException) {
            return false
        }
        return MessageDigest.isEqual(
            expected.toByteArray(StandardCharsets.UTF_8),
            alias.toByteArray(StandardCharsets.UTF_8),
        )
    }

    private fun deriveCapability(
        protocol: String,
        lessonId: UUID,
        revision: Long,
        requestedKeyVersion: Int,
    ): String = Base64.getUrlEncoder().withoutPadding().encodeToString(
        deriveCapabilityBytes(protocol, lessonId, revision, requestedKeyVersion),
    )

    private fun deriveCapabilityBytes(
        protocol: String,
        lessonId: UUID,
        revision: Long,
        requestedKeyVersion: Int,
    ): ByteArray {
        require(secret.size >= MINIMUM_SECRET_BYTES) { "Lesson access HMAC secret must contain at least 256 bits" }
        require(environmentIssuer.isNotBlank()) { "Lesson access environment issuer must be configured" }
        require(revision > 0) { "Lesson access revision must be positive" }
        require(requestedKeyVersion == keyVersion) { "Lesson access HMAC key version is not active" }

        val payload = listOf(
            protocol,
            environmentIssuer,
            lessonId.toString(),
            revision.toString(),
            requestedKeyVersion.toString(),
        ).joinToString("|")
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(secret, HMAC_ALGORITHM))
        return mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
    }

    fun hash(token: String): String = MessageDigest.getInstance(HASH_ALGORITHM)
        .digest(token.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }

    fun matchesHash(token: String, expectedHash: String): Boolean = MessageDigest.isEqual(
        hash(token).toByteArray(StandardCharsets.UTF_8),
        expectedHash.toByteArray(StandardCharsets.UTF_8),
    )

    fun protect(context: String, value: String): String {
        require(secret.size >= MINIMUM_SECRET_BYTES) { "Lesson access HMAC secret must contain at least 256 bits" }
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(secret, HMAC_ALGORITHM))
        return mac.doFinal("$context|$value".toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
    }

    fun matchesProtected(context: String, value: String, expected: String): Boolean = MessageDigest.isEqual(
        protect(context, value).toByteArray(StandardCharsets.UTF_8),
        expected.toByteArray(StandardCharsets.UTF_8),
    )

    fun matches(token: String, lessonId: UUID, revision: Long, requestedKeyVersion: Int): Boolean {
        val expected = try {
            derive(lessonId, revision, requestedKeyVersion)
        } catch (_: IllegalArgumentException) {
            return false
        }
        return MessageDigest.isEqual(
            expected.toByteArray(StandardCharsets.UTF_8),
            token.toByteArray(StandardCharsets.UTF_8),
        )
    }

    private fun decodeSecret(value: String): ByteArray = if (value.isBlank()) {
        ByteArray(0)
    } else {
        try {
            Base64.getDecoder().decode(value.trim())
        } catch (exception: IllegalArgumentException) {
            throw IllegalArgumentException("Lesson access HMAC secret is not valid Base64", exception)
        }
    }

    private companion object {
        const val FULL_TOKEN_PROTOCOL = "lesson-link-v1"
        const val ALIAS_PROTOCOL = "lesson-alias-v1"
        const val ALIAS_BYTES = 12
        const val HMAC_ALGORITHM = "HmacSHA256"
        const val HASH_ALGORITHM = "SHA-256"
        const val MINIMUM_SECRET_BYTES = 32
    }
}
