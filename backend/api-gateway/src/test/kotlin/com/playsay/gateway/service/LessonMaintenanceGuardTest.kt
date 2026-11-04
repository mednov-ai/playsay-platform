package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.StudentProfileRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.context.ApplicationEventPublisher
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class LessonMaintenanceGuardTest {
    @Test
    fun `normal operation permits admission`() {
        LessonMaintenanceGuard(false).requireLessonAdmission()
    }

    @Test
    fun `maintenance prevents starting lessons before touching storage`() {
        val lessons = mock(LessonRepo::class.java)
        val service = ScheduledLessonLifecycleService(
            lessons,
            mock(LessonReminderService::class.java),
            mock(ScheduledLessonStore::class.java),
            mock(ScheduledLessonAuthorizationService::class.java),
            mock(ApplicationEventPublisher::class.java),
            LessonMaintenanceGuard(true),
        )
        val error = assertThrows<ProjectResponseException> {
            service.start(mock(JwtAuthenticationToken::class.java), UUID.randomUUID())
        }
        assertMaintenance(error)
        verifyNoInteractions(lessons)
    }

    @Test
    fun `maintenance prevents issuing room tokens before touching storage`() {
        val lessons = mock(LessonRepo::class.java)
        val tokens = mock(LiveKitTokenService::class.java)
        val service = LiveKitRoomStore(
            lessons,
            mock(LessonParticipantRepo::class.java),
            mock(StudentProfileRepo::class.java),
            mock(ScheduledLessonAuthorizationService::class.java),
            mock(LessonAdmissionGuard::class.java),
            tokens,
            mock(RegionalMediaRoutingService::class.java),
            LessonMaintenanceGuard(true),
        )
        val error = assertThrows<ProjectResponseException> {
            service.createToken(mock(JwtAuthenticationToken::class.java), UUID.randomUUID())
        }
        assertMaintenance(error)
        verifyNoInteractions(lessons, tokens)
    }

    private fun assertMaintenance(error: ProjectResponseException) {
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.statusCode)
        assertEquals("GAME_MAINTENANCE", error.errorCode)
    }
}
