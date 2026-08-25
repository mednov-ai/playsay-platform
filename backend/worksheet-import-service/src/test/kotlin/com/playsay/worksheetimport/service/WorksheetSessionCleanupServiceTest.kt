package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.domain.WorksheetSourceKind
import com.playsay.worksheetimport.entity.WorksheetImportPageEntity
import com.playsay.worksheetimport.entity.WorksheetImportSessionEntity
import com.playsay.worksheetimport.entity.WorksheetImportSourceEntity
import com.playsay.worksheetimport.repo.WorksheetImportPageRepository
import com.playsay.worksheetimport.repo.WorksheetImportSessionRepository
import com.playsay.worksheetimport.repo.WorksheetImportSourceRepository
import java.nio.file.Files
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.transaction.support.TransactionSynchronizationManager

class WorksheetSessionCleanupServiceTest {
    private val sessions = mock(WorksheetImportSessionRepository::class.java)
    private val sources = mock(WorksheetImportSourceRepository::class.java)
    private val pages = mock(WorksheetImportPageRepository::class.java)
    private val storage = InMemoryWorksheetStagingStorage()
    private val now = Instant.parse("2026-08-24T12:00:00Z")
    private val service = WorksheetSessionCleanupService(
        sessions, sources, pages, storage, WorksheetSessionAccessPolicy(), Clock.fixed(now, ZoneOffset.UTC),
    )

    @AfterEach
    fun resetSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization()
    }

    @Test
    fun `cancellation deletes records and opaque objects only after commit`() {
        val session = session(WorksheetImportStatus.REVIEW_REQUIRED)
        val sourceId = UUID.randomUUID()
        val sourcePath = temp("source")
        val pagePath = temp("page")
        storage.put("opaque-source", sourcePath, "application/pdf")
        storage.put("opaque-page", pagePath, "image/png")
        `when`(sessions.lockById(session.id)).thenReturn(session)
        `when`(sources.findAllBySessionIdOrderBySourceOrder(session.id)).thenReturn(
            listOf(WorksheetImportSourceEntity(sourceId, session.id, 0, WorksheetSourceKind.PDF, "x.pdf", "application/pdf", 1, "a".repeat(64), "opaque-source", 1, now)),
        )
        `when`(pages.findAllBySessionIdOrderByPageOrder(session.id)).thenReturn(
            listOf(WorksheetImportPageEntity(UUID.randomUUID(), session.id, sourceId, 0, 1, "opaque-page", "image/png", 1, "b".repeat(64), 1, 1, createdAt = now, updatedAt = now)),
        )
        TransactionSynchronizationManager.initSynchronization()

        service.cancelAuthorized(session.id, authentication("teacher-a", "TEACHER"))
        assertEquals(setOf("opaque-source", "opaque-page"), storage.keys())
        TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }

        assertTrue(storage.keys().isEmpty())
        verify(pages).deleteAllBySessionId(session.id)
        verify(sources).deleteAllBySessionId(session.id)
        verify(sessions).delete(session)
        Files.deleteIfExists(sourcePath)
        Files.deleteIfExists(pagePath)
    }

    @Test
    fun `materialized session cannot be cancelled or expired`() {
        val session = session(WorksheetImportStatus.MATERIALIZED)
        `when`(sessions.lockById(session.id)).thenReturn(session)
        assertFailsWith<WorksheetSessionStateException> {
            service.cancelAuthorized(session.id, authentication("teacher-a", "TEACHER"))
        }
        verify(sessions, never()).delete(session)
    }

    private fun session(status: WorksheetImportStatus) = WorksheetImportSessionEntity(
        id = UUID.randomUUID(), ownerSubject = "teacher-a", status = status, title = "x", language = "en", cefrLevel = "A1",
        createdAt = now, updatedAt = now, expiresAt = now.minusSeconds(1),
    )

    private fun authentication(subject: String, role: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).issuedAt(now).expiresAt(now.plusSeconds(60)).build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority("ROLE_$role")))
    }

    private fun temp(value: String) = Files.createTempFile("worksheet-cleanup-", ".bin").also { Files.writeString(it, value) }
}
