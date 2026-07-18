package com.playsay.gateway.service

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.StudentProfileEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonParticipantRow
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.repo.StudentProfileRepo
import com.playsay.gateway.utils.MetaData
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.Optional
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class LessonTranslationServiceTest {
    private val lessonRepo = mock(LessonRepo::class.java)
    private val participantRepo = mock(LessonParticipantRepo::class.java)
    private val studentProfileRepo = mock(StudentProfileRepo::class.java)
    private val userRepo = mock(AppUserRepo::class.java)
    private val credentials = mock(LessonTranslationCredentialProvider::class.java)
    private val service = LessonTranslationService(lessonRepo, participantRepo, studentProfileRepo, userRepo, credentials)

    @Test
    fun `teacher receives English translation credential for the student track`() {
        val fixture = individualLesson(studentLocale = "de-DE")
        val safetyIdentifier = safetyIdentifier(fixture.teacher.keycloakSubject)
        `when`(credentials.create("en", safetyIdentifier)).thenReturn(credential())

        val response = service.createSession(authentication(fixture.teacher.keycloakSubject), fixture.lesson.id)

        assertEquals("en", response.targetLanguage)
        assertEquals(fixture.student.keycloakSubject, response.sourceParticipantIdentity)
        verify(credentials).create("en", safetyIdentifier)
    }

    @Test
    fun `student receives translation in profile locale without exposing subject as safety identifier`() {
        val fixture = individualLesson(studentLocale = "fr-FR")
        val safetyIdentifier = safetyIdentifier(fixture.student.keycloakSubject)
        `when`(credentials.create("fr", safetyIdentifier)).thenReturn(credential())

        val response = service.createSession(authentication(fixture.student.keycloakSubject), fixture.lesson.id)

        assertEquals("fr", response.targetLanguage)
        assertEquals(fixture.teacher.keycloakSubject, response.sourceParticipantIdentity)
        verify(credentials).create("fr", safetyIdentifier)
        assertNotEquals(fixture.student.keycloakSubject, safetyIdentifier)
        assertEquals(64, safetyIdentifier.length)
    }

    @Test
    fun `group lesson and unsupported student locale fail closed`() {
        val group = individualLesson(studentLocale = "ru").also { it.lesson.type = MetaData.LessonTypes.GROUP }
        val groupError = assertFailsWith<ProjectResponseException> {
            service.createSession(authentication(group.teacher.keycloakSubject), group.lesson.id)
        }
        assertEquals(HttpStatus.CONFLICT, groupError.statusCode)
        assertEquals(MetaData.ErrorCodes.LESSON_TRANSLATION_NOT_INDIVIDUAL, groupError.errorCode)

        val unsupported = individualLesson(studentLocale = "es")
        val localeError = assertFailsWith<ProjectResponseException> {
            service.createSession(authentication(unsupported.student.keycloakSubject), unsupported.lesson.id)
        }
        assertEquals(HttpStatus.CONFLICT, localeError.statusCode)
        assertEquals(MetaData.ErrorCodes.LESSON_TRANSLATION_LANGUAGE_UNAVAILABLE, localeError.errorCode)
    }

    @Test
    fun `participant outside the lesson cannot mint a translation credential`() {
        val fixture = individualLesson(studentLocale = "ru")

        val error = assertFailsWith<ProjectResponseException> {
            service.createSession(authentication("another-user"), fixture.lesson.id)
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
        assertEquals(MetaData.ErrorCodes.LESSON_TRANSLATION_ACCESS_DENIED, error.errorCode)
    }

    @Test
    fun `profile permission is required before provider credentials are requested`() {
        val fixture = individualLesson(studentLocale = "en", translationAllowed = false)

        val error = assertFailsWith<ProjectResponseException> {
            service.createSession(authentication(fixture.student.keycloakSubject), fixture.lesson.id)
        }

        assertEquals(HttpStatus.CONFLICT, error.statusCode)
        assertEquals(MetaData.ErrorCodes.LESSON_TRANSLATION_PERMISSION_REQUIRED, error.errorCode)
        verifyNoInteractions(credentials)
    }

    private fun individualLesson(studentLocale: String, translationAllowed: Boolean = true): Fixture {
        val teacher = AppUserEntity(keycloakSubject = "teacher-1", roles = MetaData.Roles.TEACHER)
        val student = AppUserEntity(keycloakSubject = "student-1", roles = MetaData.Roles.STUDENT, locale = studentLocale)
        val lesson = LessonEntity(
            teacherUserId = teacher.id,
            status = MetaData.LessonStatuses.IN_PROGRESS,
            type = MetaData.LessonTypes.INDIVIDUAL,
        )
        val row = LessonParticipantRow(
            lessonId = lesson.id,
            userId = student.id,
            subject = student.keycloakSubject,
            username = null,
            displayName = null,
            attendanceStatus = null,
            materialId = null,
            materialTitle = null,
        )
        `when`(lessonRepo.findById(lesson.id)).thenReturn(Optional.of(lesson))
        `when`(participantRepo.findParticipantRowsByLessonIds(listOf(lesson.id))).thenReturn(listOf(row))
        `when`(userRepo.findById(teacher.id)).thenReturn(Optional.of(teacher))
        `when`(userRepo.findById(student.id)).thenReturn(Optional.of(student))
        `when`(studentProfileRepo.findByUserId(student.id)).thenReturn(
            StudentProfileEntity(userId = student.id, lessonTranslationAllowed = translationAllowed),
        )
        return Fixture(lesson, teacher, student)
    }

    private fun credential() = TranslationCredential(
        clientSecret = "short-lived-secret",
        expiresAt = Instant.parse("2026-07-16T10:00:00Z"),
        model = "gpt-realtime-translate",
        callsUrl = "https://api.openai.com/v1/realtime/translations/calls",
    )

    private fun safetyIdentifier(subject: String): String = MessageDigest.getInstance("SHA-256")
        .digest("playsay-lesson-translation:$subject".toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    private fun authentication(subject: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(Instant.now())
            .expiresAt(Instant.now().plusSeconds(3600))
            .build()
        return JwtAuthenticationToken(jwt)
    }

    private data class Fixture(
        val lesson: LessonEntity,
        val teacher: AppUserEntity,
        val student: AppUserEntity,
    )
}
