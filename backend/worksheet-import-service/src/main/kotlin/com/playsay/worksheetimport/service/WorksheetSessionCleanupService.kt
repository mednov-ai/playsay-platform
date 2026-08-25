package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.domain.WorksheetImportStatus
import io.micrometer.core.instrument.Metrics
import com.playsay.worksheetimport.entity.WorksheetImportSessionEntity
import com.playsay.worksheetimport.repo.WorksheetImportPageRepository
import com.playsay.worksheetimport.repo.WorksheetImportSessionRepository
import com.playsay.worksheetimport.repo.WorksheetImportSourceRepository
import java.time.Clock
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager

@Service
class WorksheetSessionCleanupService(
    private val sessions: WorksheetImportSessionRepository,
    private val sources: WorksheetImportSourceRepository,
    private val pages: WorksheetImportPageRepository,
    private val storage: WorksheetStagingStorage,
    private val accessPolicy: WorksheetSessionAccessPolicy,
    private val clock: Clock,
) {
    @Transactional
    fun cancelAuthorized(id: UUID, authentication: JwtAuthenticationToken) {
        val session = sessions.lockById(id) ?: throw WorksheetSessionNotFoundException()
        if (!accessPolicy.canAccess(authentication, session.ownerSubject)) throw WorksheetSessionNotFoundException()
        if (session.status == WorksheetImportStatus.MATERIALIZED) throw WorksheetSessionStateException()
        deleteSession(session)
    }

    @Scheduled(fixedDelayString = "\${playsay.worksheet-import.retention.cleanup-delay:PT1H}")
    @Transactional
    fun cleanupExpired() {
        sessions.findAllByExpiresAtBeforeAndStatusNot(clock.instant(), WorksheetImportStatus.MATERIALIZED)
            .forEach(::deleteSession)
    }

    private fun deleteSession(session: WorksheetImportSessionEntity) {
        val sourceEntities = sources.findAllBySessionIdOrderBySourceOrder(session.id)
        val pageEntities = pages.findAllBySessionIdOrderByPageOrder(session.id)
        val keys = (sourceEntities.map { it.storageKey } + pageEntities.map { it.rasterStorageKey }).toSet()
        Metrics.summary("playsay.worksheet.import.cleanup.age.seconds")
            .record(java.time.Duration.between(session.createdAt, clock.instant()).seconds.coerceAtLeast(0).toDouble())
        Metrics.counter("playsay.worksheet.import.cleanup.sessions", "status", session.status.name).increment()
        Metrics.summary("playsay.worksheet.import.cleanup.objects").record(keys.size.toDouble())
        pages.deleteAllBySessionId(session.id)
        sources.deleteAllBySessionId(session.id)
        sessions.delete(session)
        TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
            override fun afterCommit() {
                keys.forEach { key ->
                    runCatching { storage.delete(key) }
                        .onFailure { logger.warn("Worksheet staging cleanup failed after session deletion") }
                }
            }
        })
    }

    private companion object {
        val logger = LoggerFactory.getLogger(WorksheetSessionCleanupService::class.java)
    }
}
