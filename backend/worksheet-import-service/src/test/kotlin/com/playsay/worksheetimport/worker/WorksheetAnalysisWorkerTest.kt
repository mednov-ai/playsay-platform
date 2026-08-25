package com.playsay.worksheetimport.worker

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.worksheetimport.ai.StubWorksheetAnalysisProvider
import com.playsay.worksheetimport.ai.WorksheetAnalysisProvider
import com.playsay.worksheetimport.ai.WorksheetAnalysisProviderException
import com.playsay.worksheetimport.ai.WorksheetAnalysisValidator
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.domain.WorksheetPacketResolution
import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import com.playsay.worksheetimport.entity.WorksheetImportPageEntity
import com.playsay.worksheetimport.entity.WorksheetImportSessionEntity
import com.playsay.worksheetimport.repo.WorksheetImportPageRepository
import com.playsay.worksheetimport.repo.WorksheetImportSessionRepository
import com.playsay.worksheetimport.service.InMemoryWorksheetStagingStorage
import java.nio.file.Files
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`

class WorksheetAnalysisWorkerTest {
    private val now = Instant.parse("2026-08-24T12:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)
    private val mapper = jacksonObjectMapper().findAndRegisterModules()

    @Test
    fun `leased processor persists validated page result and packet review`() {
        val sessions = mock(WorksheetImportSessionRepository::class.java)
        val pages = mock(WorksheetImportPageRepository::class.java)
        val storage = InMemoryWorksheetStagingStorage()
        val session = session("worker")
        val page = page(session.id)
        val raster = Files.createTempFile("worksheet-worker-", ".png").also { Files.writeString(it, "WORKSHEET_FIXTURE:MULTIPLE_CHOICE") }
        storage.put(page.rasterStorageKey, raster, "image/png")
        `when`(sessions.lockById(session.id)).thenReturn(session)
        `when`(pages.findAllBySessionIdOrderByPageOrder(session.id)).thenReturn(listOf(page))
        val stub = StubWorksheetAnalysisProvider()
        val processor = processor(sessions, pages, storage, stub, WorksheetImportProperties())

        processor.process(session.id, "worker")

        assertEquals(WorksheetImportStatus.REVIEW_REQUIRED, session.status)
        assertEquals(1, session.revision)
        assertNotNull(session.analysis)
        assertNotNull(session.review)
        assertNotNull(page.analysis)
        assertEquals(1, page.analysisAttempts)
        assertNull(session.leaseOwner)
        Files.deleteIfExists(raster)
    }

    @Test
    fun `provider failures retry with sanitized class and eventually fail`() {
        val sessions = mock(WorksheetImportSessionRepository::class.java)
        val pages = mock(WorksheetImportPageRepository::class.java)
        val storage = InMemoryWorksheetStagingStorage()
        val session = session("worker")
        val page = page(session.id)
        val raster = Files.createTempFile("worksheet-worker-", ".png").also { Files.writeString(it, "raster") }
        storage.put(page.rasterStorageKey, raster, "image/png")
        `when`(sessions.lockById(session.id)).thenReturn(session)
        `when`(pages.findAllBySessionIdOrderByPageOrder(session.id)).thenReturn(listOf(page))
        val failing = object : WorksheetAnalysisProvider {
            override fun analyzePage(page: WorksheetPageDescriptor, rasterBytes: ByteArray, mimeType: String): WorksheetPageAnalysis =
                throw WorksheetAnalysisProviderException()
            override fun resolvePacket(orderedPageIds: List<UUID>, analyses: List<WorksheetPageAnalysis>): WorksheetPacketResolution =
                throw WorksheetAnalysisProviderException()
        }
        val properties = WorksheetImportProperties(analysis = WorksheetImportProperties.Analysis(maxRetries = 0))

        processor(sessions, pages, storage, failing, properties).process(session.id, "worker")

        assertEquals(WorksheetImportStatus.FAILED, session.status)
        assertEquals("PROVIDER", session.failureClass)
        assertEquals("PROVIDER", page.analysisFailureClass)
        assertEquals(1, page.analysisAttempts)
        Files.deleteIfExists(raster)
    }

    @Test
    fun `lease claim bounds work and replaces stale lease ownership`() {
        val sessions = mock(WorksheetImportSessionRepository::class.java)
        val stale = session("old-worker").also { it.leaseUntil = now.minusSeconds(1) }
        `when`(sessions.lockEligibleForAnalysis(now, 1)).thenReturn(listOf(stale))
        val leaseService = WorksheetAnalysisLeaseService(sessions, WorksheetImportProperties(), clock)

        assertEquals(listOf(stale.id), leaseService.claim("new-worker", 1))
        assertEquals("new-worker", stale.leaseOwner)
        assertEquals(now.plusSeconds(300), stale.leaseUntil)
        assertEquals(emptyList(), leaseService.claim("new-worker", 0))
    }

    private fun processor(
        sessions: WorksheetImportSessionRepository,
        pages: WorksheetImportPageRepository,
        storage: InMemoryWorksheetStagingStorage,
        provider: WorksheetAnalysisProvider,
        properties: WorksheetImportProperties,
    ) = WorksheetAnalysisProcessor(sessions, pages, storage, provider, WorksheetAnalysisValidator(mapper), mapper, properties, clock)

    private fun session(worker: String) = WorksheetImportSessionEntity(
        id = UUID.randomUUID(), ownerSubject = "teacher", status = WorksheetImportStatus.ANALYZING,
        title = "Worksheet", language = "en", cefrLevel = "A1", leaseOwner = worker, leaseUntil = now.plusSeconds(300),
        createdAt = now, updatedAt = now, expiresAt = now.plusSeconds(3600),
    )

    private fun page(sessionId: UUID) = WorksheetImportPageEntity(
        id = UUID.randomUUID(), sessionId = sessionId, sourceId = UUID.randomUUID(), pageOrder = 0,
        rasterStorageKey = "opaque-raster", rasterMimeType = "image/png", rasterByteSize = 10,
        rasterChecksumSha256 = "a".repeat(64), width = 100, height = 100, createdAt = now, updatedAt = now,
    )
}
