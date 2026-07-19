package com.playsay.email.service

import com.fasterxml.jackson.databind.ObjectMapper
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

data class ReplayPayload(
    val from: String,
    val to: String,
    val subject: String,
    val textBody: String,
    val htmlBody: String,
)

data class EncryptedReplayPayload(val ciphertext: String, val nonce: String)

@Component
class EmailReplayCipher(
    private val objectMapper: ObjectMapper,
    @param:Value("\${playsay.email-service.replay-encryption-key:}") encodedKey: String,
) {
    private val key = encodedKey.takeIf(String::isNotBlank)?.let { value ->
        Base64.getDecoder().decode(value).also { decoded ->
            require(decoded.size == 32) { "Email replay encryption key must be 32 bytes encoded as base64" }
        }
    }
    private val secureRandom = SecureRandom()

    fun available(): Boolean = key != null

    fun encrypt(payload: ReplayPayload): EncryptedReplayPayload? {
        val encryptionKey = key ?: return null
        val nonce = ByteArray(12).also(secureRandom::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(encryptionKey, "AES"), GCMParameterSpec(128, nonce))
        val encrypted = cipher.doFinal(objectMapper.writeValueAsBytes(payload))
        return EncryptedReplayPayload(
            ciphertext = Base64.getEncoder().encodeToString(encrypted),
            nonce = Base64.getEncoder().encodeToString(nonce),
        )
    }

    fun decrypt(ciphertext: String, nonce: String): ReplayPayload {
        val encryptionKey = requireNotNull(key) { "Email replay encryption is not configured" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(encryptionKey, "AES"),
            GCMParameterSpec(128, Base64.getDecoder().decode(nonce)),
        )
        return objectMapper.readValue(
            cipher.doFinal(Base64.getDecoder().decode(ciphertext)),
            ReplayPayload::class.java,
        )
    }
}
