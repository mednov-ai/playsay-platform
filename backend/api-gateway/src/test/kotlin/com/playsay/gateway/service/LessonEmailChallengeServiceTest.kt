package com.playsay.gateway.service

import com.playsay.gateway.client.LessonReminderEmailClient
import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.entity.LessonEmailChallengeEntity
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.repo.LessonEmailChallengeRepo
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`

class LessonEmailChallengeServiceTest {
    private val now = Instant.parse("2026-08-26T10:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)
    private val tokenService = LessonAccessTokenService(
        Base64.getEncoder().encodeToString(ByteArray(32) { 7 }),
        "https://dev.auth.example/realms/playsay",
        1,
    )

    @Test
    fun `unknown email and throttled requests return the same generic response`() {
        val unknown = fixture(rateAllowed = true)
        val throttled = fixture(rateAllowed = false)

        val unknownResponse = unknown.service.requestCode(
            unknown.lessonId, unknown.attempt.id, "browser-secret", "unknown@example.test", "en", "192.0.2.10",
        )
        val throttledResponse = throttled.service.requestCode(
            throttled.lessonId, throttled.attempt.id, "browser-secret", "unknown@example.test", "en", "192.0.2.10",
        )

        assertEquals("CODE_SENT_IF_ELIGIBLE", unknownResponse.status)
        assertEquals(unknownResponse, throttledResponse)
        assertNull(unknown.savedChallenge?.targetSubject)
        verifyNoInteractions(unknown.emailClient)
        verifyNoInteractions(throttled.emailClient)
    }

    private fun fixture(rateAllowed: Boolean): Fixture {
        val lessonId = UUID.randomUUID()
        val attempt = LessonEntryAttemptEntity(
            lessonId = lessonId,
            browserSecretHash = tokenService.hash("browser-secret"),
            expiresAt = now.plusSeconds(600),
            createdAt = now,
            updatedAt = now,
        )
        val attemptRepo = mock(LessonEntryAttemptRepo::class.java)
        val challengeRepo = mock(LessonEmailChallengeRepo::class.java)
        val registrationGateway = mock(RegistrationGateway::class.java)
        val emailClient = mock(LessonReminderEmailClient::class.java)
        val rateLimit = mock(LessonChallengeRateLimitService::class.java)
        `when`(attemptRepo.lockById(attempt.id)).thenReturn(attempt)
        `when`(challengeRepo.findFirstByAttemptIdAndConsumedAtIsNullOrderByCreatedAtDesc(attempt.id)).thenReturn(null)
        `when`(registrationGateway.resolveLessonIdentity("unknown@example.test")).thenReturn(null)
        `when`(
            rateLimit.allow(
                lessonId,
                attempt.id,
                tokenService.protect("lesson-entry-email", "unknown@example.test"),
                "192.0.2.10",
            ),
        ).thenReturn(rateAllowed)
        var savedChallenge: LessonEmailChallengeEntity? = null
        `when`(challengeRepo.save(any())).thenAnswer { invocation ->
            (invocation.arguments[0] as LessonEmailChallengeEntity).also { savedChallenge = it }
        }
        val service = LessonEmailChallengeService(
            attemptRepo, challengeRepo, mock(LessonRepo::class.java), mock(LessonParticipantRepo::class.java),
            registrationGateway, emailClient, tokenService, mock(LessonAdmissionService::class.java),
            mock(LessonAssertionHandoffService::class.java), mock(LessonAccessAuditService::class.java), rateLimit, clock,
        )
        return Fixture(service, lessonId, attempt, emailClient) { savedChallenge }
    }

    private class Fixture(
        val service: LessonEmailChallengeService,
        val lessonId: UUID,
        val attempt: LessonEntryAttemptEntity,
        val emailClient: LessonReminderEmailClient,
        private val saved: () -> LessonEmailChallengeEntity?,
    ) {
        val savedChallenge: LessonEmailChallengeEntity? get() = saved()
    }
}
