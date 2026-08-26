package com.playsay.gateway.service

import java.util.Base64
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class LessonAccessTokenServiceTest {
    private val secret = Base64.getEncoder().encodeToString(ByteArray(32) { index -> (index + 1).toByte() })
    private val lessonId = UUID.fromString("66e88a63-cce0-43a8-9e63-ad7b3b5a8c72")

    @Test
    fun `derivation is stable for the same active lesson revision`() {
        val service = service()

        assertEquals(service.derive(lessonId, 3), service.derive(lessonId, 3))
    }

    @Test
    fun `revision rotation changes the link and invalidates the old token`() {
        val service = service()
        val oldToken = service.derive(lessonId, 3)
        val rotatedToken = service.derive(lessonId, 4)

        assertNotEquals(oldToken, rotatedToken)
        assertFalse(service.matches(oldToken, lessonId, 4, 7))
        assertTrue(service.matches(rotatedToken, lessonId, 4, 7))
    }

    @Test
    fun `environment issuer binds tokens to one environment`() {
        val prod = service("https://auth.honey-school.ru/realms/playsay")
        val dev = service("https://auth.dev.honey-school.ru/realms/playsay")
        val prodToken = prod.derive(lessonId, 1)

        assertFalse(dev.matches(prodToken, lessonId, 1, 7))
        assertNotEquals(prodToken, dev.derive(lessonId, 1))
    }

    @Test
    fun `key version mismatch fails closed`() {
        val service = service()

        assertFalse(service.matches(service.derive(lessonId, 1), lessonId, 1, 6))
    }

    @Test
    fun `secret shorter than 256 bits cannot derive a link`() {
        val shortSecret = Base64.getEncoder().encodeToString(ByteArray(31))
        val service = LessonAccessTokenService(shortSecret, "https://issuer.example", 1)

        assertFailsWith<IllegalArgumentException> { service.derive(lessonId, 1) }
    }

    @Test
    fun `email code hashes are context bound and compare without storing the value`() {
        val service = service()
        val protected = service.protect("lesson-entry-code:challenge-1", "123456")

        assertTrue(service.matchesProtected("lesson-entry-code:challenge-1", "123456", protected))
        assertFalse(service.matchesProtected("lesson-entry-code:challenge-2", "123456", protected))
        assertFalse(service.matchesProtected("lesson-entry-code:challenge-1", "654321", protected))
        assertNotEquals("123456", protected)
    }

    private fun service(issuer: String = "https://auth.honey-school.ru/realms/playsay") =
        LessonAccessTokenService(secret, issuer, 7)
}
