package com.playsay.vocabulary.service

import com.playsay.vocabulary.entity.VocabularyUserProjection
import com.playsay.vocabulary.repo.VocabularyLessonAccessRepo
import com.playsay.vocabulary.repo.VocabularyLessonParticipantRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

class VocabularyAccessServiceTest {
    private val users = mock(VocabularyUserRepo::class.java)
    private val participants = mock(VocabularyLessonParticipantRepo::class.java)
    private val lessons = mock(VocabularyLessonAccessRepo::class.java)
    private val access = VocabularyAccessService(users, participants, lessons)
    private val lessonId = UUID.randomUUID()
    private val studentId = UUID.randomUUID()
    private val teacherId = UUID.randomUUID()

    @Test
    fun `owner can access own vocabulary without a lesson`() {
        assertEquals("student-subject", access.requireOwnerAccess("student-subject", "student-subject", null))
    }

    @Test
    fun `assigned teacher can access a lesson participant vocabulary`() {
        stubUsers()
        `when`(participants.existsByLessonIdAndStudentUserId(lessonId, studentId)).thenReturn(true)
        `when`(lessons.canTeacherAccessLessonStudent(lessonId, teacherId, studentId)).thenReturn(true)

        assertEquals("student-subject", access.requireOwnerAccess("teacher-subject", "student-subject", lessonId))
        verify(lessons).canTeacherAccessLessonStudent(lessonId, teacherId, studentId)
    }

    @Test
    fun `unrelated teacher is forbidden even when the student participates in the lesson`() {
        stubUsers()
        `when`(participants.existsByLessonIdAndStudentUserId(lessonId, studentId)).thenReturn(true)
        `when`(lessons.canTeacherAccessLessonStudent(lessonId, teacherId, studentId)).thenReturn(false)

        val exception = assertThrows(ResponseStatusException::class.java) {
            access.requireOwnerAccess("teacher-subject", "student-subject", lessonId)
        }

        assertEquals(HttpStatus.FORBIDDEN, exception.statusCode)
    }

    private fun stubUsers() {
        `when`(users.findByKeycloakSubject("student-subject")).thenReturn(
            VocabularyUserProjection(id = studentId, keycloakSubject = "student-subject", roles = "STUDENT"),
        )
        `when`(users.findByKeycloakSubject("teacher-subject")).thenReturn(
            VocabularyUserProjection(id = teacherId, keycloakSubject = "teacher-subject", roles = "TEACHER"),
        )
    }
}
