package com.playsay.registration.service

import com.playsay.registration.entity.LessonAuthAssertionEntity
import com.playsay.registration.repo.LessonAuthAssertionRepo
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.mockingDetails
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.web.server.ResponseStatusException

class LessonAuthServiceTest {
    private val now = Instant.parse("2026-08-26T10:00:00Z")
    private val keycloak = mock(KeycloakRegistrationClient::class.java)
    private val repo = mock(LessonAuthAssertionRepo::class.java)
    private val tokens = RegistrationTokenService()
    private val service = LessonAuthService(
        keycloak = keycloak,
        repo = repo,
        tokens = tokens,
        clock = Clock.fixed(now, ZoneOffset.UTC),
        expectedClientId = CLIENT_ID,
        expectedIssuer = ISSUER,
        allowedCallbackOrigins = CALLBACK_ORIGIN,
    )

    @Test
    fun `assertion stores only a hash and preserves all credentials`() {
        val subject = "student-subject"
        `when`(keycloak.findUserBySubject(subject)).thenReturn(user(subject))
        `when`(repo.saveAndFlush(any(LessonAuthAssertionEntity::class.java))).thenAnswer { invocation -> invocation.arguments[0] }

        val created = service.create(command(subject))

        assertTrue(created.handle.isNotBlank())
        assertEquals(now.plusSeconds(120), created.expiresAt)
        val invokedMethods = mockingDetails(keycloak).invocations.map { it.method.name }.toSet()
        assertTrue("updatePassword" !in invokedMethods)
        assertTrue("listCredentials" !in invokedMethods)
        assertTrue("setRealmRoles" !in invokedMethods)
    }

    @Test
    fun `redemption is bound to exact client issuer callback and succeeds only once`() {
        val subject = "teacher-subject"
        val handle = "opaque-one-time-handle"
        val assertion = assertion(handle, subject)
        `when`(repo.lockByHandleHash(tokens.hash(handle))).thenReturn(assertion)
        `when`(keycloak.findUserBySubject(subject)).thenReturn(user(subject))
        `when`(repo.saveAndFlush(assertion)).thenReturn(assertion)

        val redeemed = service.redeem(handle, CLIENT_ID, ISSUER, CALLBACK)

        assertEquals(subject, redeemed.subject)
        assertTrue(redeemed.rememberMe)
        assertEquals(now, assertion.redeemedAt)
        assertFailsWith<ResponseStatusException> { service.redeem(handle, CLIENT_ID, ISSUER, CALLBACK) }
    }

    @Test
    fun `wrong callback and expired assertion fail closed`() {
        assertFailsWith<ResponseStatusException> {
            service.redeem("handle", CLIENT_ID, ISSUER, "https://attacker.example/callback")
        }

        val handle = "expired-handle"
        val expired = assertion(handle, "student-subject").also { it.expiresAt = now }
        `when`(repo.lockByHandleHash(tokens.hash(handle))).thenReturn(expired)
        assertFailsWith<ResponseStatusException> { service.redeem(handle, CLIENT_ID, ISSUER, CALLBACK) }
    }

    @Test
    fun `verified email resolution rejects disabled unverified and mismatched identities`() {
        val normalized = "student@example.com"
        val lookup = user("student", normalized)
        `when`(keycloak.findUserByEmail(normalized)).thenReturn(lookup)
        `when`(keycloak.findUserBySubject("student")).thenReturn(lookup.copy(emailVerified = false))

        assertEquals(null, service.resolveVerifiedEmail(" Student@Example.com "))

        `when`(keycloak.findUserBySubject("student")).thenReturn(lookup)
        val resolved = service.resolveVerifiedEmail(" Student@Example.com ")
        assertEquals("student", resolved?.subject)
        assertNotEquals(null, resolved)
    }

    private fun command(subject: String) = CreateLessonAuthAssertionCommand(
        subject = subject,
        browserAttemptId = UUID.fromString("9bc0395c-51a6-4d56-b8ab-5168d4d01269"),
        clientId = CLIENT_ID,
        issuer = ISSUER,
        callback = CALLBACK,
        rememberMe = true,
    )

    private fun assertion(handle: String, subject: String) = LessonAuthAssertionEntity(
        handleHash = tokens.hash(handle),
        subject = subject,
        browserAttemptId = UUID.randomUUID(),
        clientId = CLIENT_ID,
        issuer = ISSUER,
        callback = CALLBACK,
        rememberMe = true,
        expiresAt = now.plusSeconds(120),
        createdAt = now,
    )

    private fun user(subject: String, email: String = "$subject@example.com") = KeycloakRegistrationUser(
        username = subject,
        email = email,
        enabled = true,
        emailVerified = true,
        subject = subject,
        roles = setOf("STUDENT"),
    )

    private companion object {
        const val CLIENT_ID = "playsay-web"
        const val ISSUER = "https://auth.honey.school/realms/playsay"
        const val CALLBACK_ORIGIN = "https://online.honey.school"
        const val CALLBACK = "$CALLBACK_ORIGIN/auth/callback"
    }
}
