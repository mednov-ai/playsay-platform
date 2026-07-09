package com.playsay.registration.service

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import org.springframework.stereotype.Component

@Component
class RegistrationTokenService {
    private val random = SecureRandom()

    fun newToken(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun newStudentInviteCode(): String =
        (1..studentInviteCodeLength)
            .map { studentInviteAlphabet[random.nextInt(studentInviteAlphabet.length)] }
            .joinToString("")

    fun normalizeStudentInviteCode(code: String): String =
        code
            .trim()
            .uppercase()
            .filterNot { it == '-' || it.isWhitespace() }
            .map { char ->
                when (char) {
                    'O' -> '0'
                    'I', 'L' -> '1'
                    else -> char
                }
            }
            .joinToString("")

    fun hash(token: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(token.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { byte -> "%02x".format(byte) }
    }

    private companion object {
        const val studentInviteAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
        const val studentInviteCodeLength = 6
    }
}
