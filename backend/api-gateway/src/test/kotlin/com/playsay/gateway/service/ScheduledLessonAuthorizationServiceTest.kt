package com.playsay.gateway.service

import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import java.time.Instant
import java.util.Optional
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class ScheduledLessonAuthorizationServiceTest {
    private val lessonId = UUID.fromString("3f17260b-dc3a-486a-b75b-7227310a7220")
    private val teacherId = UUID.fromString("bc61618d-d60b-41a3-a937-7551416eb287")
    private val studentId = UUID.fromString("b3e53fd3-b55b-4145-9932-4a0704254729")

    @Test
    fun `admin override is explicit and student role fails before assignment lookup`() {
        val fixture = fixture()

        assertTrue(fixture.service.canManageLesson(authentication("admin-1", "ROLE_ADMIN"), lessonId))
        assertFalse(fixture.service.canManageLesson(authentication("student-1", "ROLE_STUDENT"), lessonId))

        verifyNoInteractions(fixture.lessonRepo, fixture.participantRepo, fixture.userProfileStore, fixture.studentAccessPolicy)
    }

    @Test
    fun `assigned teacher and permitted delegate can manage while outsider teacher cannot`() {
        val assigned = fixture()
        val assignedAuth = authentication("teacher-1", "ROLE_TEACHER")
        `when`(assigned.userProfileStore.currentUserId(assignedAuth)).thenReturn(teacherId)
        `when`(assigned.lessonRepo.findById(lessonId)).thenReturn(Optional.of(lesson(teacherId)))
        assertTrue(assigned.service.canManageLesson(assignedAuth, lessonId))

        val delegate = fixture()
        val delegateId = UUID.fromString("fc46036e-b3de-4993-8fca-019862d50dab")
        val delegateAuth = authentication("delegate-1", "ROLE_TEACHER")
        `when`(delegate.userProfileStore.currentUserId(delegateAuth)).thenReturn(delegateId)
        `when`(delegate.lessonRepo.findById(lessonId)).thenReturn(Optional.of(lesson(teacherId)))
        `when`(delegate.participantRepo.findByLessonId(lessonId)).thenReturn(listOf(participant()))
        `when`(delegate.studentAccessPolicy.canAccessEveryStudent(delegateId, listOf(studentId))).thenReturn(true)
        assertTrue(delegate.service.canManageLesson(delegateAuth, lessonId))

        val outsider = fixture()
        val outsiderId = UUID.fromString("025a4278-da4b-44c9-afd0-27d2ee3912fb")
        val outsiderAuth = authentication("outsider-1", "ROLE_TEACHER")
        `when`(outsider.userProfileStore.currentUserId(outsiderAuth)).thenReturn(outsiderId)
        `when`(outsider.lessonRepo.findById(lessonId)).thenReturn(Optional.of(lesson(teacherId)))
        `when`(outsider.participantRepo.findByLessonId(lessonId)).thenReturn(listOf(participant()))
        `when`(outsider.studentAccessPolicy.canAccessEveryStudent(outsiderId, listOf(studentId))).thenReturn(false)
        assertFalse(outsider.service.canManageLesson(outsiderAuth, lessonId))
    }

    private fun fixture(): Fixture {
        val lessonRepo = mock(LessonRepo::class.java)
        val participantRepo = mock(LessonParticipantRepo::class.java)
        val userProfileStore = mock(UserProfileStore::class.java)
        val studentAccessPolicy = mock(StudentAccessPolicy::class.java)
        return Fixture(
            ScheduledLessonAuthorizationService(lessonRepo, participantRepo, userProfileStore, studentAccessPolicy),
            lessonRepo,
            participantRepo,
            userProfileStore,
            studentAccessPolicy,
        )
    }

    private fun lesson(assignedTeacherId: UUID) = LessonEntity(id = lessonId, teacherUserId = assignedTeacherId)

    private fun participant() = LessonParticipantEntity(lessonId = lessonId, studentUserId = studentId)

    private fun authentication(subject: String, authority: String): JwtAuthenticationToken {
        val now = Instant.parse("2026-08-26T10:00:00Z")
        val jwt = Jwt.withTokenValue("test")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(now)
            .expiresAt(now.plusSeconds(300))
            .build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(authority)))
    }

    private data class Fixture(
        val service: ScheduledLessonAuthorizationService,
        val lessonRepo: LessonRepo,
        val participantRepo: LessonParticipantRepo,
        val userProfileStore: UserProfileStore,
        val studentAccessPolicy: StudentAccessPolicy,
    )
}
