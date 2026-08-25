package com.playsay.worksheetimport.repo

import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.entity.WorksheetImportPageEntity
import com.playsay.worksheetimport.entity.WorksheetImportSessionEntity
import com.playsay.worksheetimport.entity.WorksheetImportSourceEntity
import jakarta.persistence.LockModeType
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.data.jpa.repository.Modifying

interface WorksheetImportSessionRepository : JpaRepository<WorksheetImportSessionEntity, UUID> {
    fun findByIdAndOwnerSubject(id: UUID, ownerSubject: String): WorksheetImportSessionEntity?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from WorksheetImportSessionEntity session where session.id = :id")
    fun lockById(id: UUID): WorksheetImportSessionEntity?

    fun findAllByStatusInAndLeaseUntilBefore(statuses: Collection<WorksheetImportStatus>, at: Instant): List<WorksheetImportSessionEntity>
    fun findAllByExpiresAtBeforeAndStatusNot(at: Instant, status: WorksheetImportStatus): List<WorksheetImportSessionEntity>

    @Query(
        value = """
            select * from worksheet_import_session
             where status = 'ANALYZING'
               and (lease_until is null or lease_until < :at)
             order by created_at
             limit :limit
             for update skip locked
        """,
        nativeQuery = true,
    )
    fun lockEligibleForAnalysis(at: Instant, limit: Int): List<WorksheetImportSessionEntity>
}

interface WorksheetImportSourceRepository : JpaRepository<WorksheetImportSourceEntity, UUID> {
    fun findAllBySessionIdOrderBySourceOrder(sessionId: UUID): List<WorksheetImportSourceEntity>
    fun deleteAllBySessionId(sessionId: UUID)
}

interface WorksheetImportPageRepository : JpaRepository<WorksheetImportPageEntity, UUID> {
    fun findAllBySessionIdOrderByPageOrder(sessionId: UUID): List<WorksheetImportPageEntity>
    fun findByIdAndSessionId(id: UUID, sessionId: UUID): WorksheetImportPageEntity?
    fun deleteAllBySessionId(sessionId: UUID)
}
