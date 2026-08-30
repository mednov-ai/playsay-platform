package com.playsay.gateway.service

import com.playsay.contract.registration.model.InternalUserIdentityResponse
import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.dto.LessonAuthAssertionRequest
import com.playsay.gateway.dto.LessonAuthAssertionResponse
import com.playsay.gateway.entity.LessonAdmissionEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.repo.ScheduledLessonRow
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Optional
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`

class LessonAssertionHandoffServiceTest {
    private val now = Instant.parse("2026-08-30T10:00:00Z")

    @Test
    fun `assertion callback and continuation stay on the attempt origin`() {
        val fixture = fixture("https://online.honeyschool.ru")

        val response = fixture.service.issue(fixture.attempt)

        verify(fixture.registration).createLessonAuthAssertion(
            LessonAuthAssertionRequest(
                "student-1",
                fixture.attempt.id,
                "playsay-web",
                "https://ops.honey.school/keycloak/realms/playsay",
                "https://online.honeyschool.ru/auth/callback",
                false,
            ),
        )
        assertEquals(
            "https://online.honeyschool.ru/lesson-access/${fixture.attempt.lessonId}/auth#assertion=assertion-handle",
            response.authorizationUrl,
        )
    }

    private fun fixture(origin: String): Fixture {
        val lessonId = UUID.randomUUID()
        val subject = "student-1"
        val attempt = LessonEntryAttemptEntity(
            lessonId = lessonId,
            requestOrigin = origin,
            targetSubject = subject,
            state = "CONFIRMED",
            expiresAt = now.plusSeconds(600),
            createdAt = now,
            updatedAt = now,
        )
        val attemptRepo = mock(LessonEntryAttemptRepo::class.java)
        val lessonRepo = mock(LessonRepo::class.java)
        val participantRepo = mock(LessonParticipantRepo::class.java)
        val admissionService = mock(LessonAdmissionService::class.java)
        val registration = mock(RegistrationGateway::class.java)
        `when`(lessonRepo.findById(lessonId)).thenReturn(
            Optional.of(
                LessonEntity(
                    id = lessonId,
                    status = "SCHEDULED",
                    scheduledStart = now.minusSeconds(60),
                    scheduledEnd = now.plusSeconds(3600),
                ),
            ),
        )
        `when`(lessonRepo.findScheduleRowById(lessonId)).thenReturn(scheduleRow(lessonId))
        `when`(participantRepo.existsByLessonIdAndSubject(lessonId, subject)).thenReturn(true)
        `when`(registration.findExactUser(subject)).thenReturn(
            InternalUserIdentityResponse(
                subject = subject,
                username = subject,
                email = "$subject@example.test",
                displayName = subject,
                roles = setOf("STUDENT"),
                enabled = true,
            ),
        )
        `when`(admissionService.find(lessonId, subject)).thenReturn(
            LessonAdmissionEntity(lessonId = lessonId, subject = subject, status = "ADMITTED"),
        )
        `when`(
            registration.createLessonAuthAssertion(
                LessonAuthAssertionRequest(
                    subject,
                    attempt.id,
                    "playsay-web",
                    "https://ops.honey.school/keycloak/realms/playsay",
                    "$origin/auth/callback",
                    false,
                ),
            ),
        ).thenReturn(
            LessonAuthAssertionResponse("assertion-handle", now.plusSeconds(60)),
        )
        `when`(attemptRepo.save(attempt)).thenReturn(attempt)
        val service = LessonAssertionHandoffService(
            attemptRepo,
            lessonRepo,
            participantRepo,
            admissionService,
            registration,
            mock(LessonAccessAuditService::class.java),
            LessonAccessOriginPolicy("https://online.honey.school", "https://online.honeyschool.ru"),
            Clock.fixed(now, ZoneOffset.UTC),
            "playsay-web",
            "https://ops.honey.school/keycloak/realms/playsay",
        )
        return Fixture(service, attempt, registration)
    }

    private fun scheduleRow(lessonId: UUID) = ScheduledLessonRow(
        id = lessonId,
        lessonTemplateId = null,
        inheritTemplateMaterial = false,
        materialId = null,
        materialTitle = null,
        courseId = null,
        courseTitle = null,
        lessonTitle = null,
        teacherSubject = "teacher-1",
        teacherName = null,
        scheduledStart = now.minusSeconds(60),
        scheduledEnd = now.plusSeconds(3600),
        status = "SCHEDULED",
        type = "INDIVIDUAL",
        workMode = "SHARED",
        recurrenceSeriesId = null,
        recurrenceIndex = null,
        recurrenceTotal = null,
        livekitRoomName = null,
        createdAt = now,
        updatedAt = now,
    )

    private data class Fixture(
        val service: LessonAssertionHandoffService,
        val attempt: LessonEntryAttemptEntity,
        val registration: RegistrationGateway,
    )
}
