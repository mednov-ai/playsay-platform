package com.playsay.gateway.realtime

import com.playsay.gateway.ScheduledLessonParticipantResponse
import com.playsay.gateway.ScheduledLessonResponse
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LessonRealtimePrincipalTest {
    @Test
    fun `teacher can see any lesson update`() {
        val principal = LessonRealtimePrincipal(subject = "teacher-1", roles = setOf("TEACHER"))

        assertTrue(principal.canSee(lesson(participantSubjects = listOf("student-1"))))
    }

    @Test
    fun `student sees only own active lesson update`() {
        val principal = LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT"))
        val now = Instant.parse("2026-05-25T10:00:00Z")

        assertTrue(principal.canSee(lesson(participantSubjects = listOf("student-1")), now))
        assertFalse(principal.canSee(lesson(participantSubjects = listOf("student-2")), now))
    }

    @Test
    fun `student does not receive completed cancelled or expired lesson snapshot`() {
        val principal = LessonRealtimePrincipal(subject = "student-1", roles = setOf("STUDENT"))
        val now = Instant.parse("2026-05-25T10:00:00Z")

        assertFalse(principal.canSee(lesson(status = "COMPLETED", participantSubjects = listOf("student-1")), now))
        assertFalse(principal.canSee(lesson(status = "CANCELLED", participantSubjects = listOf("student-1")), now))
        assertFalse(
            principal.canSee(
                lesson(
                    scheduledEnd = Instant.parse("2026-05-25T09:59:59Z"),
                    participantSubjects = listOf("student-1"),
                ),
                now,
            ),
        )
    }

    private fun lesson(
        status: String = "SCHEDULED",
        scheduledEnd: Instant? = Instant.parse("2026-05-25T10:45:00Z"),
        participantSubjects: List<String>,
    ): ScheduledLessonResponse =
        ScheduledLessonResponse(
            id = UUID.randomUUID(),
            lessonTemplateId = null,
            materialId = null,
            materialTitle = null,
            courseId = null,
            courseTitle = null,
            lessonTitle = "Realtime visibility",
            teacherSubject = "teacher-1",
            teacherName = "Teacher Demo",
            scheduledStart = Instant.parse("2026-05-25T10:00:00Z"),
            scheduledEnd = scheduledEnd,
            status = status,
            type = "GROUP",
            livekitRoomName = null,
            participants = participantSubjects.map { subject ->
                ScheduledLessonParticipantResponse(
                    subject = subject,
                    username = subject,
                    displayName = subject,
                    attendanceStatus = "PLANNED",
                )
            },
            createdAt = Instant.parse("2026-05-25T09:00:00Z"),
            updatedAt = Instant.parse("2026-05-25T09:00:00Z"),
        )
}
