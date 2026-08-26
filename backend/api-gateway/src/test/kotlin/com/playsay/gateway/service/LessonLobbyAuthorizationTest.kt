package com.playsay.gateway.service

import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.realtime.LessonRealtimeHub
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class LessonLobbyAuthorizationTest {
    private val lessonId = UUID.fromString("e0b58eb5-e82a-42b4-8a0d-c2fb74c46917")
    private val attemptId = UUID.fromString("f9f9ad1b-1ea8-4eca-aa58-c155354728df")
    private val now = Instant.parse("2026-08-26T10:00:00Z")

    @Test
    fun `student cannot approve deny kick or readmit`() {
        val fixture = fixture()
        val student = authentication("student-1", "ROLE_STUDENT")
        `when`(fixture.authorization.canManageLesson(student, lessonId)).thenReturn(false)

        assertFailsWith<ProjectResponseException> { fixture.service.approve(student, lessonId, attemptId, "student-2", null) }
        assertFailsWith<ProjectResponseException> { fixture.service.deny(student, lessonId, attemptId) }
        assertFailsWith<ProjectResponseException> { fixture.service.kick(student, lessonId, "student-2", null) }
        assertFailsWith<ProjectResponseException> { fixture.service.readmit(student, lessonId, "student-2", null) }

        verify(fixture.authorization, times(4)).canManageLesson(student, lessonId)
        verifyNoInteractions(fixture.lessonRepo, fixture.attemptRepo, fixture.audit)
    }

    @Test
    fun `admin override denial is recorded as an admin audit event`() {
        val fixture = fixture()
        val admin = authentication("admin-1", "ROLE_ADMIN")
        val attempt = LessonEntryAttemptEntity(
            id = attemptId,
            lessonId = lessonId,
            state = "LOBBY_PENDING",
            expiresAt = now.plusSeconds(600),
            createdAt = now,
            updatedAt = now,
        )
        `when`(fixture.authorization.canManageLesson(admin, lessonId)).thenReturn(true)
        `when`(fixture.lessonRepo.lockById(lessonId)).thenReturn(LessonEntity(id = lessonId))
        `when`(fixture.attemptRepo.lockById(attemptId)).thenReturn(attempt)
        `when`(fixture.attemptRepo.save(attempt)).thenReturn(attempt)

        assertEquals("DENIED", fixture.service.deny(admin, lessonId, attemptId).status)
        verify(fixture.audit).record(
            lessonId,
            LessonAccessAuditEvent.LOBBY_DENIED,
            LessonAccessAuditOutcome.ACCEPTED,
            LessonAccessActorKind.ADMIN,
        )
    }

    private fun fixture(): Fixture {
        val attemptRepo = mock(LessonEntryAttemptRepo::class.java)
        val participantRepo = mock(LessonParticipantRepo::class.java)
        val lessonRepo = mock(LessonRepo::class.java)
        val registrationGateway = mock(RegistrationGateway::class.java)
        val authorization = mock(ScheduledLessonAuthorizationService::class.java)
        val admission = mock(LessonAdmissionService::class.java)
        val handoff = mock(LessonAssertionHandoffService::class.java)
        val realtime = mock(LessonRealtimeHub::class.java)
        val liveKit = mock(LiveKitParticipantRemovalClient::class.java)
        val collaboration = mock(CollaborationDisconnectClient::class.java)
        val audit = mock(LessonAccessAuditService::class.java)
        val tokenService = LessonAccessTokenService(
            Base64.getEncoder().encodeToString(ByteArray(32) { 9 }),
            "https://issuer.example",
            1,
        )
        val service = LessonLobbyService(
            attemptRepo,
            participantRepo,
            lessonRepo,
            registrationGateway,
            authorization,
            admission,
            handoff,
            realtime,
            liveKit,
            collaboration,
            audit,
            tokenService,
            Clock.fixed(now, ZoneOffset.UTC),
        )
        return Fixture(service, attemptRepo, lessonRepo, authorization, audit)
    }

    private fun authentication(subject: String, authority: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("test")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(now)
            .expiresAt(now.plusSeconds(300))
            .build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(authority)))
    }

    private data class Fixture(
        val service: LessonLobbyService,
        val attemptRepo: LessonEntryAttemptRepo,
        val lessonRepo: LessonRepo,
        val authorization: ScheduledLessonAuthorizationService,
        val audit: LessonAccessAuditService,
    )
}
