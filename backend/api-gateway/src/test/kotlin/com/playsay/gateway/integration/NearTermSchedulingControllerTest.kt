package com.playsay.gateway.integration

import com.playsay.gateway.ScheduledLessonControllerTestFixture
import com.playsay.gateway.dto.ScheduledLessonRecurrenceRequest
import com.playsay.gateway.dto.ScheduledLessonRequest
import com.playsay.gateway.dto.ScheduledLessonScheduleUpdateRequest
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NearTermSchedulingControllerTest : ScheduledLessonControllerTestFixture() {
    @Test
    fun `teacher directly creates current and future lessons without shifting their interval`() {
        val teacher = authentication("teacher-1", "teacher.one", "ROLE_TEACHER")
        val student = authentication("student-1", "student.one", "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val now = Instant.now().truncatedTo(ChronoUnit.MINUTES)
        for (offset in listOf(0L, 1L, 5L, 10L, 30L, 1440L)) {
            val start = now.plusSeconds(offset * 60)
            val end = start.plusSeconds(45 * 60)
            val created = scheduleController.create(teacher, ScheduledLessonRequest(
                scheduledStart = start, scheduledEnd = end, participantSubjects = listOf("student-1"),
                status = "SCHEDULED", type = "INDIVIDUAL", workMode = "SHARED",
            )).body!!
            assertEquals(start, created.scheduledStart)
            assertEquals(end, created.scheduledEnd)
            assertEquals("SCHEDULED", created.status)
            assertEquals(start, scheduleController.get(teacher, created.id).scheduledStart)
            assertTrue(scheduleController.list(student).any { it.id == created.id })
        }
        val later = scheduleController.create(teacher, ScheduledLessonRequest(
            scheduledStart = now.plusSeconds(3600), scheduledEnd = now.plusSeconds(6300),
            participantSubjects = listOf("student-1"),
        )).body!!
        val moved = scheduleController.reschedule(teacher, later.id, ScheduledLessonScheduleUpdateRequest(now, now.plusSeconds(2700)))
        assertEquals(now, moved.scheduledStart)
    }
    @Test
    fun `near term recurrence preserves its first occurrence and student snapshot`() {
        val teacher = authentication("teacher-1", "teacher.one", "ROLE_TEACHER")
        val student = authentication("student-1", "student.one", "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val start = Instant.now().truncatedTo(ChronoUnit.MINUTES).plusSeconds(600)
        val end = start.plusSeconds(2700)
        val created = scheduleController.create(teacher, ScheduledLessonRequest(
            scheduledStart = start, scheduledEnd = end, participantSubjects = listOf("student-1"),
            recurrence = ScheduledLessonRecurrenceRequest(count = 2,
                weekdays = listOf(start.atZone(ZoneOffset.UTC).dayOfWeek.name), timeZone = "UTC"),
        )).body!!
        val lessons = scheduleController.list(student).filter { it.recurrenceSeriesId == created.recurrenceSeriesId }
            .sortedBy { it.recurrenceIndex }
        assertEquals(listOf(start, start.plusSeconds(7 * 24 * 3600)), lessons.map { it.scheduledStart })
        assertTrue(lessons.all { it.status == "SCHEDULED" && it.scheduledEnd == it.scheduledStart!!.plusSeconds(2700) })
    }

}
