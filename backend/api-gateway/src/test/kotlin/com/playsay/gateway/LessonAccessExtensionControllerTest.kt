package com.playsay.gateway

import com.playsay.gateway.dto.LessonAccessExtensionRequest
import com.playsay.gateway.dto.ScheduledLessonRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.lessonAccessDeadline
import com.playsay.gateway.service.isLessonInsideAccessWindow
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

@org.springframework.test.context.TestPropertySource(properties = ["playsay.collaboration.token-secret=01234567890123456789012345678901", "playsay.collaboration.websocket-url=wss://local.test/collab/ws"])
class LessonAccessExtensionControllerTest : ScheduledLessonControllerTestFixture() {
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    private lateinit var clock: java.time.Clock

    @org.springframework.beans.factory.annotation.Autowired
    private lateinit var collaborationController: com.playsay.gateway.controller.CollaborationDocumentController

    @org.junit.jupiter.api.AfterEach
    fun resetClock() { org.mockito.Mockito.reset(clock) }

    @Test
    fun `repeat extensions follow the persisted deadline and server clock`() {
        org.mockito.Mockito.doReturn(Instant.parse("2026-10-04T07:23:00Z")).`when`(clock).instant()
        val initial = scheduleController.create(teacher(), ScheduledLessonRequest(
            scheduledStart = Instant.parse("2026-10-04T06:30:00Z"), scheduledEnd = Instant.parse("2026-10-04T07:15:00Z"),
            participantSubjects = listOf("student-1"),
        )).body!!.let { scheduleController.start(teacher(), it.id) }
        assertEquals(Instant.parse("2026-10-04T07:25:00Z"), initial.accessEndsAt)
        val first = scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision))
        org.mockito.Mockito.doReturn(first.accessEndsAt!!.minusSeconds(120)).`when`(clock).instant()
        val second = scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(first.accessRevision))
        assertEquals(initial.accessEndsAt!!.plusSeconds(1200), second.accessEndsAt)
        assertEquals(initial.scheduledEnd, second.scheduledEnd)
        assertEquals(1200, lessonRepo.findById(initial.id).orElseThrow().accessExtensionSeconds)
        org.mockito.Mockito.doReturn(second.accessEndsAt).`when`(clock).instant()
        assertFailsWith<ProjectResponseException> { scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(second.accessRevision)) }
    }

    private fun teacher() = authentication("teacher-1", "teacher.one", "ROLE_TEACHER")
    private fun student() = authentication("student-1", "student.one", "ROLE_STUDENT")
    private fun activeLesson(materialId: java.util.UUID? = null): com.playsay.gateway.dto.ScheduledLessonResponse {
        val now = Instant.now()
        return scheduleController.create(teacher(), ScheduledLessonRequest(
            materialId = materialId,
            scheduledStart = now.minusSeconds(2700), scheduledEnd = now.minusSeconds(500),
            participantSubjects = listOf("student-1"),
        )).body!!.let { scheduleController.start(teacher(), it.id) }
    }

    @Test
    fun `extension persists without moving the schedule and permits extended student rejoin`() {
        val initial = activeLesson()
        assertTrue(initial.canExtend == true)
        val updated = scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision))
        assertEquals(initial.scheduledEnd, updated.scheduledEnd)
        assertEquals(initial.accessEndsAt!!.plusSeconds(600), updated.accessEndsAt)
        assertEquals(initial.accessRevision + 1, updated.accessRevision)
        val row = lessonRepo.findById(initial.id).orElseThrow()
        assertEquals(600, row.accessExtensionSeconds)
        val future = initial.accessEndsAt!!.plusSeconds(30)
        assertTrue(isLessonInsideAccessWindow(row.status, row.scheduledStart, row.scheduledEnd, future, setOf("COMPLETED", "CANCELLED"), row.accessExtensionSeconds))
        assertTrue(lessonRepo.findJoinableForStudent(initial.id, "student-1", future.plusSeconds(600), future.minusSeconds(600), "IN_PROGRESS") != null)
        assertFalse(scheduleController.get(student(), initial.id).canExtend == true)
        assertEquals(updated.accessEndsAt, scheduleController.get(student(), initial.id).accessEndsAt)
        assertFailsWith<ProjectResponseException> { scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision)) }
        assertEquals(600, lessonRepo.findById(initial.id).orElseThrow().accessExtensionSeconds)
    }

    @Test
    fun `student room admission uses the extension and rejects final expiry`() {
        val initial = activeLesson()
        val updated = scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision))
        org.mockito.Mockito.doReturn(initial.accessEndsAt!!.plusSeconds(30)).`when`(clock).instant()
        assertTrue(scheduleController.list(student()).any { it.id == initial.id })
        assertTrue(liveKitRoomController.createToken(student(), initial.id).token.isNotBlank())
        org.mockito.Mockito.doReturn(updated.accessEndsAt).`when`(clock).instant()
        assertFalse(scheduleController.list(student()).any { it.id == initial.id })
        assertFailsWith<ProjectResponseException> { liveKitRoomController.createToken(student(), initial.id) }
    }

    @Test
    fun `shared link and collaboration use the same effective cutoff`() {
        val material = materialCrudController.create(teacher(), com.playsay.gateway.dto.LessonMaterialRequest(title = "Extension test", status = "PUBLISHED")).body!!
        val initial = activeLesson(material.id)
        val link = lessonAccessController.getOrCreate(teacher(), initial.id)
        val updated = scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision))
        org.mockito.Mockito.doReturn(initial.accessEndsAt!!.plusSeconds(30)).`when`(clock).instant()
        val attempt = lessonAccessController.startCompact("https://online.honeyschool.ru", com.playsay.gateway.dto.LessonCompactAccessStartRequest(link.alias))
        assertTrue(!lessonEntryAttemptRepo.findById(attempt.attemptId).orElseThrow().expiresAt.isAfter(updated.accessEndsAt))
        val document = collaborationController.createCurrent(student(), initial.id, com.playsay.gateway.dto.CreateCollaborationDocumentRequest(material.id, "MATERIAL_WORK", "GROUP"))
        assertTrue(collaborationController.token(student(), initial.id, document.id).token.isNotBlank())
        org.mockito.Mockito.doReturn(updated.accessEndsAt).`when`(clock).instant()
        assertFailsWith<ProjectResponseException> { lessonAccessController.startCompact("https://online.honeyschool.ru", com.playsay.gateway.dto.LessonCompactAccessStartRequest(link.alias)) }
        assertFailsWith<ProjectResponseException> { collaborationController.token(student(), initial.id, document.id) }
    }

    @Test
    fun `reschedule resets the extension and invalidates stale requests`() {
        val initial = activeLesson()
        val updated = scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision))
        val start = Instant.now().plusSeconds(3600)
        val moved = scheduleController.reschedule(teacher(), initial.id, com.playsay.gateway.dto.ScheduledLessonScheduleUpdateRequest(start, start.plusSeconds(2700)))
        assertEquals(0, lessonRepo.findById(initial.id).orElseThrow().accessExtensionSeconds)
        assertEquals(updated.accessRevision + 1, moved.accessRevision)
        assertEquals(start.plusSeconds(3300), moved.accessEndsAt)
        assertFailsWith<ProjectResponseException> { scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(updated.accessRevision)) }
    }

    @Test
    fun `only one concurrent request extends the same deadline`() {
        val initial = activeLesson()
        val pool = Executors.newFixedThreadPool(2)
        val gate = CountDownLatch(1)
        try {
            val futures = (1..2).map { pool.submit(Callable {
                gate.await()
                try { scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision)); true }
                catch (_: ProjectResponseException) { false }
            }) }
            gate.countDown()
            assertEquals(1, futures.count { it.get(10, TimeUnit.SECONDS) })
            assertEquals(600, lessonRepo.findById(initial.id).orElseThrow().accessExtensionSeconds)
        } finally { pool.shutdownNow() }
    }

    @Test
    fun `student early late and completed requests cannot extend`() {
        val initial = activeLesson()
        assertFailsWith<ProjectResponseException> { scheduleController.extendAccess(student(), initial.id, LessonAccessExtensionRequest(initial.accessRevision)) }
        assertFailsWith<ProjectResponseException> {
            scheduleController.extendAccess(authentication("unrelated-teacher", "other.teacher", "ROLE_TEACHER"), initial.id, LessonAccessExtensionRequest(initial.accessRevision))
        }
        val row = lessonRepo.findById(initial.id).orElseThrow()
        row.scheduledEnd = Instant.now().plusSeconds(900)
        lessonRepo.saveAndFlush(row)
        assertFailsWith<ProjectResponseException> { scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision)) }
        row.scheduledEnd = Instant.now().minusSeconds(601)
        lessonRepo.saveAndFlush(row)
        assertFailsWith<ProjectResponseException> { scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision)) }
        row.scheduledEnd = initial.scheduledEnd
        lessonRepo.saveAndFlush(row)
        scheduleController.complete(teacher(), initial.id)
        assertFailsWith<ProjectResponseException> { scheduleController.extendAccess(teacher(), initial.id, LessonAccessExtensionRequest(initial.accessRevision)) }
        assertEquals(0, lessonRepo.findById(initial.id).orElseThrow().accessExtensionSeconds)
    }

    @Test
    fun `policy keeps the initial grace and excludes the exact cutoff`() {
        val end = Instant.parse("2026-10-04T07:15:00Z")
        assertEquals(Instant.parse("2026-10-04T07:25:00Z"), lessonAccessDeadline(end))
        assertEquals(Instant.parse("2026-10-04T07:45:00Z"), lessonAccessDeadline(end, 1200))
        assertFalse(isLessonInsideAccessWindow("IN_PROGRESS", end.minusSeconds(2700), end, end.plusSeconds(600), setOf("COMPLETED")))
    }
}
