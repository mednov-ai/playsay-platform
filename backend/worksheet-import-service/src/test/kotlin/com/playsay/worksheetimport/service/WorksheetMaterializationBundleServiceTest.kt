package com.playsay.worksheetimport.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.worksheetimport.ai.StubWorksheetAnalysisProvider
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.domain.WorksheetReview
import com.playsay.worksheetimport.domain.WorksheetReviewPage
import com.playsay.worksheetimport.domain.WorksheetSourceKind
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
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`

class WorksheetMaterializationBundleServiceTest {
    private val sessions = mock(WorksheetImportSessionRepository::class.java)
    private val sources = mock(WorksheetImportSourceRepository::class.java)
    private val pages = mock(WorksheetImportPageRepository::class.java)
    private val storage = InMemoryWorksheetStagingStorage()
    private val mapper = jacksonObjectMapper().findAndRegisterModules()
    private val now = Instant.parse("2026-08-24T12:00:00Z")
    private val service = WorksheetMaterializationBundleService(
        sessions, sources, pages, storage, mapper, WorksheetReviewValidator(WorksheetImportProperties()), Clock.fixed(now, ZoneOffset.UTC),
    )

    @Test
    fun `bundle keeps static and worksheet pages omits key and retains original PDF privately`() {
        val session = session()
        val source = source(session.id)
        val stub = StubWorksheetAnalysisProvider()
        val interactive = stub.fixture(UUID.randomUUID(), "MULTIPLE_CHOICE")
        val static = stub.fixture(UUID.randomUUID(), "STATIC")
        val key = stub.fixture(UUID.randomUUID(), "ANSWER_KEY")
        val review = WorksheetReview(listOf(interactive, static, key).mapIndexed { index, result ->
            WorksheetReviewPage(result.pageId, index, result.role, sections = result.sections, groups = result.groups)
        }, attribution = "Synthetic", rightsNote = "Owned")
        session.review = mapper.writeValueAsString(review)
        val pageEntities = review.pages.map { reviewed -> page(session.id, source.id, reviewed.id, reviewed.order) }
        `when`(sessions.findById(session.id)).thenReturn(Optional.of(session))
        `when`(sources.findAllBySessionIdOrderBySourceOrder(session.id)).thenReturn(listOf(source))
        `when`(pages.findAllBySessionIdOrderByPageOrder(session.id)).thenReturn(pageEntities)

        val first = service.bundle(session.id, 3, true)
        val second = service.bundle(session.id, 3, true)

        assertEquals(first.assets.map { it.id }, second.assets.map { it.id })
        assertEquals(2, first.document["pages"].size())
        assertEquals(listOf("WORKSHEET", "STATIC_IMAGE"), first.document["pages"].map { it["layout"].asText() })
        assertEquals(1, first.assets.count { it.pageId == null && !it.learnerVisible })
        assertTrue(first.assets.first { it.pageId == key.pageId }.learnerVisible.not())
        assertTrue(first.sourceMeta["watermarksPreserved"].asBoolean())
        assertFailsWith<WorksheetMaterializationBlockedException> { service.bundle(session.id, 2, true) }
        assertFailsWith<WorksheetMaterializationBlockedException> { service.bundle(session.id, 3, false) }
    }

    @Test
    fun `acknowledgement is idempotent and rejects a conflicting material`() {
        val session = session()
        `when`(sessions.lockById(session.id)).thenReturn(session)
        val materialId = UUID.randomUUID()
        assertEquals(materialId, service.acknowledge(session.id, 3, materialId))
        assertEquals(WorksheetImportStatus.MATERIALIZED, session.status)
        assertEquals(materialId, service.acknowledge(session.id, 3, materialId))
        assertFailsWith<WorksheetMaterializationConflictException> { service.acknowledge(session.id, 3, UUID.randomUUID()) }
    }

    private fun session() = WorksheetImportSessionEntity(
        id = UUID.randomUUID(), ownerSubject = "teacher", status = WorksheetImportStatus.READY, revision = 3,
        title = "Worksheet", language = "en", cefrLevel = "A1", sourceNote = "Synthetic source",
        createdAt = now, updatedAt = now, expiresAt = now.plusSeconds(3600),
    )

    private fun source(sessionId: UUID) = WorksheetImportSourceEntity(
        id = UUID.randomUUID(), sessionId = sessionId, sourceOrder = 0, kind = WorksheetSourceKind.PDF,
        fileName = "source.pdf", mimeType = "application/pdf", byteSize = 10, checksumSha256 = "a".repeat(64),
        storageKey = "original", pageCount = 3, createdAt = now,
    )

    private fun page(sessionId: UUID, sourceId: UUID, pageId: UUID, order: Int) = WorksheetImportPageEntity(
        id = pageId, sessionId = sessionId, sourceId = sourceId, pageOrder = order, sourcePageNumber = order + 1,
        rasterStorageKey = "page-$order", rasterMimeType = "image/png", rasterByteSize = 5,
        rasterChecksumSha256 = "b".repeat(64), width = 100, height = 140, createdAt = now, updatedAt = now,
    )
}
