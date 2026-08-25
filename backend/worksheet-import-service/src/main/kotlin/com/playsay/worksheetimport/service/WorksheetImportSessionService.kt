package com.playsay.worksheetimport.service

import com.fasterxml.jackson.databind.ObjectMapper
import io.micrometer.core.instrument.Metrics
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetImportSession
import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageRole
import com.playsay.worksheetimport.domain.WorksheetReview
import com.playsay.worksheetimport.domain.WorksheetReviewPage
import com.playsay.worksheetimport.domain.WorksheetSectionType
import com.playsay.worksheetimport.domain.WorksheetSourceDescriptor
import com.playsay.worksheetimport.entity.WorksheetImportPageEntity
import com.playsay.worksheetimport.entity.WorksheetImportSessionEntity
import com.playsay.worksheetimport.entity.WorksheetImportSourceEntity
import com.playsay.worksheetimport.repo.WorksheetImportPageRepository
import com.playsay.worksheetimport.repo.WorksheetImportSessionRepository
import com.playsay.worksheetimport.repo.WorksheetImportSourceRepository
import java.time.Clock
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager

data class WorksheetSessionCreateCommand(
    val ownerSubject: String,
    val title: String,
    val language: String,
    val cefrLevel: String,
    val sourceNote: String?,
)

class WorksheetSessionNotFoundException : RuntimeException("Worksheet import session was not found.")
class WorksheetSessionStateException : RuntimeException("Worksheet import session state does not allow this operation.")
class WorksheetRevisionConflictException(
    val currentRevision: Long,
    val currentStatus: WorksheetImportStatus,
) : RuntimeException("Worksheet import revision conflict.")

@Service
@Suppress("LongParameterList")
class WorksheetImportSessionService(
    private val sessions: WorksheetImportSessionRepository,
    private val sources: WorksheetImportSourceRepository,
    private val pages: WorksheetImportPageRepository,
    private val objectMapper: ObjectMapper,
    private val properties: WorksheetImportProperties,
    private val accessPolicy: WorksheetSessionAccessPolicy,
    private val clock: Clock = Clock.systemUTC(),
    private val canonicalizer: WorksheetReviewCanonicalizer = WorksheetReviewCanonicalizer(),
    private val reviewValidator: WorksheetReviewValidator = WorksheetReviewValidator(properties),
) {
    @Transactional
    fun create(command: WorksheetSessionCreateCommand, packet: NormalizedWorksheetPacket): WorksheetImportSession {
        val now = clock.instant()
        val session = sessions.save(
            WorksheetImportSessionEntity(
                id = packet.sessionId,
                ownerSubject = command.ownerSubject,
                title = command.title,
                language = command.language,
                cefrLevel = command.cefrLevel,
                sourceNote = command.sourceNote,
                createdAt = now,
                updatedAt = now,
                expiresAt = now.plus(properties.retention.duration),
            ),
        )
        sources.saveAll(packet.sources.map { descriptor -> descriptor.toEntity(packet, now) })
        pages.saveAll(packet.pages.map { descriptor -> descriptor.toEntity(packet, now) })
        registerStorageOutcome(packet)
        Metrics.counter("playsay.worksheet.import.sessions", "status", WorksheetImportStatus.ANALYZING.name).increment()
        Metrics.summary("playsay.worksheet.import.packet.sources").record(packet.sources.size.toDouble())
        Metrics.summary("playsay.worksheet.import.packet.pages").record(packet.pages.size.toDouble())
        return assemble(session)
    }

    @Transactional(readOnly = true)
    fun getAuthorized(id: UUID, authentication: org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken): WorksheetImportSession {
        val entity = sessions.findById(id).orElseThrow(::WorksheetSessionNotFoundException)
        if (!accessPolicy.canAccess(authentication, entity.ownerSubject)) throw WorksheetSessionNotFoundException()
        return assemble(entity)
    }

    @Transactional
    fun transition(id: UUID, expected: WorksheetImportStatus, target: WorksheetImportStatus): WorksheetImportSession {
        if (target !in allowedTransitions.getValue(expected)) throw WorksheetSessionStateException()
        val entity = sessions.lockById(id) ?: throw WorksheetSessionNotFoundException()
        if (entity.status != expected) throw WorksheetSessionStateException()
        entity.status = target
        entity.revision += 1
        entity.updatedAt = clock.instant()
        return assemble(entity)
    }

    @Transactional
    fun replaceReview(id: UUID, expectedRevision: Long, review: WorksheetReview): WorksheetImportSession {
        val entity = sessions.lockById(id) ?: throw WorksheetSessionNotFoundException()
        if (entity.revision != expectedRevision) {
            throw WorksheetRevisionConflictException(entity.revision, entity.status)
        }
        if (entity.status !in setOf(WorksheetImportStatus.REVIEW_REQUIRED, WorksheetImportStatus.READY)) {
            throw WorksheetSessionStateException()
        }
        val current = entity.review?.let { objectMapper.readValue(it, WorksheetReview::class.java) }
        val canonical = canonicalizer.merge(current, review)
        val expectedPageIds = pages.findAllBySessionIdOrderByPageOrder(id).map { it.id }
        val blockers = reviewValidator.blockers(canonical, expectedPageIds)
        entity.review = objectMapper.writeValueAsString(canonical)
        entity.status = if (blockers.isEmpty()) WorksheetImportStatus.READY else WorksheetImportStatus.REVIEW_REQUIRED
        entity.revision += 1
        entity.updatedAt = clock.instant()
        Metrics.counter("playsay.worksheet.import.review.saves", "status", entity.status.name).increment()
        blockers.groupingBy { it.code }.eachCount().forEach { (code, count) ->
            Metrics.counter("playsay.worksheet.import.review.blockers", "code", code.name).increment(count.toDouble())
        }
        return assemble(entity)
    }

    @Transactional
    fun continueManually(id: UUID): WorksheetImportSession {
        val entity = sessions.lockById(id) ?: throw WorksheetSessionNotFoundException()
        if (entity.status !in setOf(WorksheetImportStatus.FAILED, WorksheetImportStatus.ANALYZING)) {
            throw WorksheetSessionStateException()
        }
        val reviewPages = pages.findAllBySessionIdOrderByPageOrder(id).map { page ->
            val partial = page.analysis?.let { raw ->
                runCatching { objectMapper.readValue(raw, WorksheetPageAnalysis::class.java) }.getOrNull()
            }
            WorksheetReviewPage(
                id = page.id,
                order = page.pageOrder,
                role = partial?.role ?: page.pageRole ?: WorksheetPageRole.STATIC_REFERENCE,
                sections = partial?.sections ?: listOf(WorksheetSectionType.STATIC_CONTENT),
                groups = partial?.groups.orEmpty(),
            )
        }
        entity.review = objectMapper.writeValueAsString(WorksheetReview(reviewPages))
        entity.status = WorksheetImportStatus.REVIEW_REQUIRED
        entity.revision += 1
        entity.failureClass = null
        entity.leaseOwner = null
        entity.leaseUntil = null
        entity.updatedAt = clock.instant()
        Metrics.counter("playsay.worksheet.import.manual.continuations").increment()
        return assemble(entity)
    }

    @Transactional
    fun retryAnalysis(id: UUID): WorksheetImportSession {
        val entity = sessions.lockById(id) ?: throw WorksheetSessionNotFoundException()
        if (entity.status != WorksheetImportStatus.FAILED) throw WorksheetSessionStateException()
        entity.status = WorksheetImportStatus.ANALYZING
        entity.revision += 1
        entity.failureClass = null
        entity.leaseOwner = null
        entity.leaseUntil = null
        entity.updatedAt = clock.instant()
        Metrics.counter("playsay.worksheet.import.analysis.retries", "source", "teacher").increment()
        return assemble(entity)
    }

    private fun assemble(entity: WorksheetImportSessionEntity): WorksheetImportSession {
        val sourceDescriptors = sources.findAllBySessionIdOrderBySourceOrder(entity.id).map { source ->
            WorksheetSourceDescriptor(source.id, source.sourceOrder, source.kind, source.fileName, source.mimeType, source.byteSize, source.checksumSha256)
        }
        val pageDescriptors = pages.findAllBySessionIdOrderByPageOrder(entity.id).map { page ->
            WorksheetPageDescriptor(page.id, page.sourceId, page.sourcePageNumber, page.pageOrder, page.width, page.height, page.rasterStorageKey)
        }
        val review = entity.review?.let { objectMapper.readValue(it, WorksheetReview::class.java) }
        return WorksheetImportSession(
            id = entity.id,
            ownerSubject = entity.ownerSubject,
            status = entity.status,
            revision = entity.revision,
            title = entity.title,
            language = entity.language,
            cefrLevel = entity.cefrLevel,
            sources = sourceDescriptors,
            pages = pageDescriptors,
            analysis = entity.analysis?.let(objectMapper::readTree),
            review = review,
            blockers = review?.let { reviewValidator.blockers(it, pageDescriptors.map { page -> page.id }) }.orEmpty(),
            failureClass = entity.failureClass,
            materialId = entity.materialId,
            createdAt = entity.createdAt,
            updatedAt = entity.updatedAt,
            expiresAt = entity.expiresAt,
        )
    }

    private fun WorksheetSourceDescriptor.toEntity(packet: NormalizedWorksheetPacket, now: Instant) = WorksheetImportSourceEntity(
        id = id,
        sessionId = packet.sessionId,
        sourceOrder = order,
        kind = kind,
        fileName = fileName,
        mimeType = mimeType,
        byteSize = byteSize,
        checksumSha256 = checksumSha256,
        storageKey = packet.sourceStoragePaths.getValue(id),
        pageCount = packet.pages.count { page -> page.sourceId == id },
        createdAt = now,
    )

    private fun WorksheetPageDescriptor.toEntity(packet: NormalizedWorksheetPacket, now: Instant): WorksheetImportPageEntity {
        val artifact = packet.pageArtifacts.getValue(id)
        return WorksheetImportPageEntity(
            id = id,
            sessionId = packet.sessionId,
            sourceId = sourceId,
            pageOrder = order,
            sourcePageNumber = sourcePageNumber,
            rasterStorageKey = artifact.storagePath,
            rasterMimeType = artifact.mimeType,
            rasterByteSize = artifact.byteSize,
            rasterChecksumSha256 = artifact.checksumSha256,
            width = width,
            height = height,
            createdAt = now,
            updatedAt = now,
        )
    }

    private fun registerStorageOutcome(packet: NormalizedWorksheetPacket) {
        TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
            override fun afterCommit() = packet.commit()
            override fun afterCompletion(status: Int) {
                if (status != TransactionSynchronization.STATUS_COMMITTED) packet.close()
            }
        })
    }

    private companion object {
        val allowedTransitions = mapOf(
            WorksheetImportStatus.ANALYZING to setOf(WorksheetImportStatus.REVIEW_REQUIRED, WorksheetImportStatus.FAILED),
            WorksheetImportStatus.REVIEW_REQUIRED to setOf(WorksheetImportStatus.READY, WorksheetImportStatus.FAILED),
            WorksheetImportStatus.READY to setOf(WorksheetImportStatus.REVIEW_REQUIRED, WorksheetImportStatus.MATERIALIZED),
            WorksheetImportStatus.FAILED to setOf(WorksheetImportStatus.REVIEW_REQUIRED),
            WorksheetImportStatus.MATERIALIZED to emptySet(),
        )
    }
}
