package com.playsay.gateway.service

import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.entity.LessonAdmissionEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.ScheduledLessonRow
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

    @Test
    fun `different authenticated account records only a coarse remembered-session rejection`() {
        val fixture = fixture()
        val secret = "browser-secret"
        val attempt = LessonEntryAttemptEntity(
            id = attemptId,
            lessonId = lessonId,
            browserSecretHash = fixture.tokenService.hash(secret),
            expiresAt = now.plusSeconds(600),
            createdAt = now,
            updatedAt = now,
        )
        val lesson = ScheduledLessonRow(
            id = lessonId,
            lessonTemplateId = null,
            inheritTemplateMaterial = false,
            materialId = null,
            materialTitle = null,
            courseId = null,
            courseTitle = null,
            lessonTitle = null,
            teacherSubject = "assigned-teacher",
            teacherName = null,
            scheduledStart = now,
            scheduledEnd = now.plusSeconds(3600),
            status = "IN_PROGRESS",
            type = "INDIVIDUAL",
            workMode = "SHARED",
            recurrenceSeriesId = null,
            recurrenceIndex = null,
            recurrenceTotal = null,
            livekitRoomName = null,
            createdAt = now,
            updatedAt = now,
        )
        val authentication = authentication("different-student", "ROLE_STUDENT")
        `when`(fixture.attemptRepo.lockById(attemptId)).thenReturn(attempt)
        `when`(fixture.lessonRepo.findScheduleRowById(lessonId)).thenReturn(lesson)
        `when`(fixture.participantRepo.existsByLessonIdAndSubject(lessonId, "different-student")).thenReturn(false)

        assertFailsWith<ProjectResponseException> {
            fixture.service.remembered(authentication, lessonId, attemptId, secret)
        }

        verify(fixture.audit).recordIndependent(
            LessonAccessAuditEvent.REMEMBERED_SESSION_REJECTED,
            LessonAccessAuditOutcome.REJECTED,
            LessonAccessActorKind.STUDENT,
        )
        verifyNoInteractions(fixture.handoff)
    }

    @Test
    fun `matching assigned student session enters automatically without a new proof challenge`() {
        val fixture = fixture()
        val secret = "browser-secret"
        val studentSubject = "assigned-student"
        val attempt = LessonEntryAttemptEntity(
            id = attemptId,
            lessonId = lessonId,
            browserSecretHash = fixture.tokenService.hash(secret),
            expiresAt = now.plusSeconds(600),
            createdAt = now,
            updatedAt = now,
        )
        val lesson = scheduledLesson(teacherSubject = "assigned-teacher")
        val admission = LessonAdmissionEntity(
            lessonId = lessonId,
            subject = studentSubject,
            status = LessonAdmissionStatus.ADMITTED.name,
            createdAt = now,
            updatedAt = now,
        )
        val authentication = authentication(studentSubject, "ROLE_STUDENT")
        `when`(fixture.attemptRepo.lockById(attemptId)).thenReturn(attempt)
        `when`(fixture.lessonRepo.findScheduleRowById(lessonId)).thenReturn(lesson)
        `when`(fixture.participantRepo.existsByLessonIdAndSubject(lessonId, studentSubject)).thenReturn(true)
        `when`(fixture.admission.confirmIdentity(lessonId, studentSubject, "REMEMBERED_SESSION")).thenReturn(admission)

        val response = fixture.service.remembered(authentication, lessonId, attemptId, secret)

        assertEquals("AUTHENTICATED_READY", response.status)
        assertEquals("IDENTITY_CONFIRMED", attempt.state)
        assertEquals("REMEMBERED_SESSION", attempt.confirmationMethod)
        assertEquals(studentSubject, attempt.targetSubject)
        verifyNoInteractions(fixture.audit, fixture.handoff)
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
        return Fixture(service, attemptRepo, participantRepo, lessonRepo, authorization, admission, handoff, audit, tokenService)
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
        val participantRepo: LessonParticipantRepo,
        val lessonRepo: LessonRepo,
        val authorization: ScheduledLessonAuthorizationService,
        val admission: LessonAdmissionService,
        val handoff: LessonAssertionHandoffService,
        val audit: LessonAccessAuditService,
        val tokenService: LessonAccessTokenService,
    )

    private fun scheduledLesson(teacherSubject: String) = ScheduledLessonRow(
        id = lessonId,
        lessonTemplateId = null,
        inheritTemplateMaterial = false,
        materialId = null,
        materialTitle = null,
        courseId = null,
        courseTitle = null,
        lessonTitle = null,
        teacherSubject = teacherSubject,
        teacherName = null,
        scheduledStart = now,
        scheduledEnd = now.plusSeconds(3600),
        status = "IN_PROGRESS",
        type = "INDIVIDUAL",
        workMode = "SHARED",
        recurrenceSeriesId = null,
        recurrenceIndex = null,
        recurrenceTotal = null,
        livekitRoomName = null,
        createdAt = now,
        updatedAt = now,
    )
}
