package com.playsay.worksheetimport.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.domain.WorksheetSourceKind
import com.playsay.worksheetimport.domain.WorksheetReview
import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageRole
import com.playsay.worksheetimport.domain.WorksheetSectionType
import com.playsay.worksheetimport.entity.WorksheetImportPageEntity
import com.playsay.worksheetimport.entity.WorksheetImportSessionEntity
import com.playsay.worksheetimport.entity.WorksheetImportSourceEntity
import com.playsay.worksheetimport.repo.WorksheetImportPageRepository
import com.playsay.worksheetimport.repo.WorksheetImportSessionRepository
import com.playsay.worksheetimport.repo.WorksheetImportSourceRepository
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Optional
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class WorksheetImportSessionServiceTest {
    private val sessionRepository = mock(WorksheetImportSessionRepository::class.java)
    private val sourceRepository = mock(WorksheetImportSourceRepository::class.java)
    private val pageRepository = mock(WorksheetImportPageRepository::class.java)
    private val now = Instant.parse("2026-08-24T12:00:00Z")
    private val service = WorksheetImportSessionService(
        sessionRepository,
        sourceRepository,
        pageRepository,
        jacksonObjectMapper().findAndRegisterModules(),
        WorksheetImportProperties(),
        WorksheetSessionAccessPolicy(),
        Clock.fixed(now, ZoneOffset.UTC),
    )

    @Test
    fun `reassembles ordered durable state after navigation or restart`() {
        val id = UUID.randomUUID()
        val sourceId = UUID.randomUUID()
        val session = session(id, WorksheetImportStatus.REVIEW_REQUIRED, revision = 4)
        `when`(sessionRepository.findById(id)).thenReturn(Optional.of(session))
        `when`(sourceRepository.findAllBySessionIdOrderBySourceOrder(id)).thenReturn(
            listOf(WorksheetImportSourceEntity(sourceId, id, 0, WorksheetSourceKind.PDF, "unit.pdf", "application/pdf", 12, "a".repeat(64), "opaque", 1, now)),
        )
        `when`(pageRepository.findAllBySessionIdOrderByPageOrder(id)).thenReturn(
            listOf(WorksheetImportPageEntity(UUID.randomUUID(), id, sourceId, 0, 1, "opaque-page", "image/png", 8, "b".repeat(64), 100, 200, createdAt = now, updatedAt = now)),
        )

        val restored = service.getAuthorized(id, authentication("teacher-a", "TEACHER"))

        assertEquals(WorksheetImportStatus.REVIEW_REQUIRED, restored.status)
        assertEquals(4, restored.revision)
        assertEquals(1, restored.pages.single().sourcePageNumber)
    }

    @Test
    fun `increments revision only across permitted transitions`() {
        val id = UUID.randomUUID()
        val session = session(id, WorksheetImportStatus.ANALYZING, revision = 0)
        `when`(sessionRepository.lockById(id)).thenReturn(session)
        `when`(sourceRepository.findAllBySessionIdOrderBySourceOrder(id)).thenReturn(emptyList())
        `when`(pageRepository.findAllBySessionIdOrderByPageOrder(id)).thenReturn(emptyList())

        val transitioned = service.transition(id, WorksheetImportStatus.ANALYZING, WorksheetImportStatus.REVIEW_REQUIRED)

        assertEquals(WorksheetImportStatus.REVIEW_REQUIRED, transitioned.status)
        assertEquals(1, transitioned.revision)
        assertFailsWith<WorksheetSessionStateException> {
            service.transition(id, WorksheetImportStatus.REVIEW_REQUIRED, WorksheetImportStatus.MATERIALIZED)
        }
    }

    @Test
    fun `returns the same not found outcome for missing and unrelated owners`() {
        val id = UUID.randomUUID()
        `when`(sessionRepository.findById(id)).thenReturn(Optional.of(session(id, WorksheetImportStatus.ANALYZING, 0)))
        assertFailsWith<WorksheetSessionNotFoundException> {
            service.getAuthorized(id, authentication("teacher-b", "TEACHER"))
        }
        val missing = UUID.randomUUID()
        `when`(sessionRepository.findById(missing)).thenReturn(Optional.empty())
        assertFailsWith<WorksheetSessionNotFoundException> {
            service.getAuthorized(missing, authentication("teacher-b", "TEACHER"))
        }
    }

    @Test
    fun `review replacement requires exact revision and reports only current version state`() {
        val id = UUID.randomUUID()
        val session = session(id, WorksheetImportStatus.REVIEW_REQUIRED, 7)
        `when`(sessionRepository.lockById(id)).thenReturn(session)
        `when`(sourceRepository.findAllBySessionIdOrderBySourceOrder(id)).thenReturn(emptyList())
        `when`(pageRepository.findAllBySessionIdOrderByPageOrder(id)).thenReturn(emptyList())

        val conflict = assertFailsWith<WorksheetRevisionConflictException> {
            service.replaceReview(id, 6, WorksheetReview(emptyList()))
        }
        assertEquals(7, conflict.currentRevision)
        assertEquals(WorksheetImportStatus.REVIEW_REQUIRED, conflict.currentStatus)

        val saved = service.replaceReview(id, 7, WorksheetReview(emptyList(), attribution = "Synthetic"))
        assertEquals(8, saved.revision)
        assertEquals("Synthetic", saved.review?.attribution)
    }

    @Test
    fun `manual continuation preserves partial analysis and falls back remaining pages to static`() {
        val id = UUID.randomUUID()
        val session = session(id, WorksheetImportStatus.FAILED, 2).also { it.failureClass = "PROVIDER" }
        val analyzed = WorksheetImportPageEntity(
            id = UUID.randomUUID(), sessionId = id, sourceId = UUID.randomUUID(), pageOrder = 0,
            rasterStorageKey = "a", rasterMimeType = "image/png", rasterByteSize = 1, rasterChecksumSha256 = "a".repeat(64),
            width = 10, height = 10, analysis = jacksonObjectMapper().findAndRegisterModules().writeValueAsString(
                WorksheetPageAnalysis(pageId = UUID.randomUUID(), role = WorksheetPageRole.WORKSHEET, roleConfidence = 1.0, sections = listOf(WorksheetSectionType.TYPED_GAPS), words = emptyList(), groups = emptyList()),
            ), createdAt = now, updatedAt = now,
        )
        val remaining = WorksheetImportPageEntity(
            id = UUID.randomUUID(), sessionId = id, sourceId = UUID.randomUUID(), pageOrder = 1,
            rasterStorageKey = "b", rasterMimeType = "image/png", rasterByteSize = 1, rasterChecksumSha256 = "b".repeat(64),
            width = 10, height = 10, createdAt = now, updatedAt = now,
        )
        `when`(sessionRepository.lockById(id)).thenReturn(session)
        `when`(sourceRepository.findAllBySessionIdOrderBySourceOrder(id)).thenReturn(emptyList())
        `when`(pageRepository.findAllBySessionIdOrderByPageOrder(id)).thenReturn(listOf(analyzed, remaining))

        val continued = service.continueManually(id)

        assertEquals(WorksheetImportStatus.REVIEW_REQUIRED, continued.status)
        assertEquals(listOf(WorksheetPageRole.WORKSHEET, WorksheetPageRole.STATIC_REFERENCE), continued.review?.pages?.map { it.role })
        assertEquals(null, continued.failureClass)
    }

    @Test
    fun `retry returns only a failed session to analysis without discarding partial work`() {
        val id = UUID.randomUUID()
        val session = session(id, WorksheetImportStatus.FAILED, 3).also {
            it.failureClass = "PROVIDER"
            it.leaseOwner = "stale-worker"
            it.leaseUntil = now.plusSeconds(60)
            it.analysis = "{\"partial\":true}"
        }
        `when`(sessionRepository.lockById(id)).thenReturn(session)
        `when`(sourceRepository.findAllBySessionIdOrderBySourceOrder(id)).thenReturn(emptyList())
        `when`(pageRepository.findAllBySessionIdOrderByPageOrder(id)).thenReturn(emptyList())

        val retried = service.retryAnalysis(id)

        assertEquals(WorksheetImportStatus.ANALYZING, retried.status)
        assertEquals(4, retried.revision)
        assertEquals(null, retried.failureClass)
        assertEquals(null, session.leaseOwner)
        assertEquals("{\"partial\":true}", session.analysis)
        assertFailsWith<WorksheetSessionStateException> { service.retryAnalysis(id) }
    }

    private fun session(id: UUID, status: WorksheetImportStatus, revision: Long) = WorksheetImportSessionEntity(
        id = id,
        ownerSubject = "teacher-a",
        status = status,
        revision = revision,
        title = "Worksheet",
        language = "en",
        cefrLevel = "A1",
        createdAt = now,
        updatedAt = now,
        expiresAt = now.plusSeconds(3600),
    )

    private fun authentication(subject: String, role: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).issuedAt(now).expiresAt(now.plusSeconds(60)).build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority("ROLE_$role")))
    }
}
