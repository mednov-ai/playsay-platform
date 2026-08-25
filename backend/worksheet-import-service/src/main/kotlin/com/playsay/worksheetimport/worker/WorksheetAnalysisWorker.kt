package com.playsay.worksheetimport.worker

import com.fasterxml.jackson.databind.ObjectMapper
import io.micrometer.core.instrument.Metrics
import io.micrometer.core.instrument.Timer
import com.playsay.worksheetimport.ai.InvalidWorksheetAnalysisException
import com.playsay.worksheetimport.ai.WorksheetAnalysisProvider
import com.playsay.worksheetimport.ai.WorksheetAnalysisProviderException
import com.playsay.worksheetimport.ai.WorksheetAnalysisValidator
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.domain.WorksheetPageAnalysis
import com.playsay.worksheetimport.domain.WorksheetPageDescriptor
import com.playsay.worksheetimport.domain.WorksheetReview
import com.playsay.worksheetimport.domain.WorksheetReviewPage
import com.playsay.worksheetimport.entity.WorksheetImportSessionEntity
import com.playsay.worksheetimport.repo.WorksheetImportPageRepository
import com.playsay.worksheetimport.repo.WorksheetImportSessionRepository
import com.playsay.worksheetimport.service.WorksheetStagingException
import com.playsay.worksheetimport.service.WorksheetStagingStorage
import jakarta.annotation.PreDestroy
import java.time.Clock
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class WorksheetAnalysisLeaseService(
    private val sessions: WorksheetImportSessionRepository,
    private val properties: WorksheetImportProperties,
    private val clock: Clock,
) {
    @Transactional
    fun claim(workerId: String, capacity: Int): List<UUID> {
        if (capacity <= 0) return emptyList()
        val now = clock.instant()
        return sessions.lockEligibleForAnalysis(now, capacity).map { session ->
            session.leaseOwner = workerId
            session.leaseUntil = now.plus(properties.analysis.lease)
            session.id
        }
    }
}

@Service
class WorksheetAnalysisProcessor(
    private val sessions: WorksheetImportSessionRepository,
    private val pages: WorksheetImportPageRepository,
    private val storage: WorksheetStagingStorage,
    private val provider: WorksheetAnalysisProvider,
    private val validator: WorksheetAnalysisValidator,
    private val objectMapper: ObjectMapper,
    private val properties: WorksheetImportProperties,
    private val clock: Clock,
) {
    @Transactional
    fun process(sessionId: UUID, workerId: String) {
        val session = sessions.lockById(sessionId) ?: return
        if (session.status != WorksheetImportStatus.ANALYZING || session.leaseOwner != workerId) return
        val pageEntities = pages.findAllBySessionIdOrderByPageOrder(sessionId)
        val timer = Timer.start(Metrics.globalRegistry)
        var outcome = "SUCCESS"
        try {
            val analyses = pageEntities.map { page ->
                page.analysis?.let { existing ->
                    validator.parsePage(existing, page.id)
                } ?: run {
                    val content = storage.get(page.rasterStorageKey)
                    val descriptor = WorksheetPageDescriptor(
                        page.id, page.sourceId, page.sourcePageNumber, page.pageOrder, page.width, page.height, page.rasterStorageKey,
                    )
                    val analysis = provider.analyzePage(descriptor, content.bytes, content.contentType)
                    validator.validatePage(analysis, page.id)
                    page.analysis = objectMapper.writeValueAsString(analysis)
                    page.pageRole = analysis.role
                    page.analysisAttempts += 1
                    page.analysisFailureClass = null
                    page.updatedAt = clock.instant()
                    analysis
                }
            }
            val orderedIds = pageEntities.map { it.id }
            val resolution = provider.resolvePacket(orderedIds, analyses)
            validator.validatePacket(resolution, orderedIds)
            val answerKeyAssociations = resolution.answerKeyAssociations.associateBy { it.worksheetPageId }
            pageEntities.forEach { page ->
                page.answerKeyPageId = answerKeyAssociations[page.id]?.answerKeyPageId
            }
            session.analysis = objectMapper.writeValueAsString(resolution)
            session.review = objectMapper.writeValueAsString(
                WorksheetReview(
                    pages = resolution.pages.mapIndexed { index, page ->
                        WorksheetReviewPage(
                            id = page.pageId,
                            order = index,
                            role = page.role,
                            answerKeyPageId = answerKeyAssociations[page.pageId]?.answerKeyPageId,
                            sections = page.sections,
                            groups = page.groups,
                        )
                    },
                ),
            )
            session.status = WorksheetImportStatus.REVIEW_REQUIRED
            session.revision += 1
            session.failureClass = null
            session.leaseOwner = null
            session.leaseUntil = null
            session.updatedAt = clock.instant()
        } catch (failure: Exception) {
            outcome = handleFailure(session, pageEntities.firstOrNull { it.analysis == null }, failure)
        } finally {
            timer.stop(Metrics.timer("playsay.worksheet.import.analysis.duration", "outcome", outcome))
        }
    }

    private fun handleFailure(
        session: WorksheetImportSessionEntity,
        failedPage: com.playsay.worksheetimport.entity.WorksheetImportPageEntity?,
        failure: Exception,
    ): String {
        val failureClass = when (failure) {
            is WorksheetStagingException -> "STORAGE"
            is InvalidWorksheetAnalysisException -> "INVALID_OUTPUT"
            is WorksheetAnalysisProviderException -> "PROVIDER"
            else -> "PROCESSING"
        }
        failedPage?.let { page ->
            page.analysisAttempts += 1
            page.analysisFailureClass = failureClass
            page.updatedAt = clock.instant()
        }
        session.retryCount += 1
        Metrics.counter("playsay.worksheet.import.analysis.failures", "class", failureClass).increment()
        Metrics.counter("playsay.worksheet.import.analysis.retries", "class", failureClass).increment()
        session.failureClass = failureClass
        session.leaseOwner = null
        session.leaseUntil = null
        session.updatedAt = clock.instant()
        if (session.retryCount > properties.analysis.maxRetries) {
            session.status = WorksheetImportStatus.FAILED
            session.revision += 1
        }
        return failureClass
    }
}

@Component
class WorksheetAnalysisWorker(
    private val properties: WorksheetImportProperties,
    private val leases: WorksheetAnalysisLeaseService,
    private val processor: WorksheetAnalysisProcessor,
) {
    private val workerId = "worksheet-${UUID.randomUUID()}"
    private val active = ConcurrentHashMap.newKeySet<UUID>()
    private val executor: ExecutorService =
        Executors.newFixedThreadPool(properties.analysis.concurrency) { runnable ->
            Thread(runnable, "worksheet-analysis").apply { isDaemon = true }
        }

    @Scheduled(fixedDelayString = "\${playsay.worksheet-import.analysis.poll-delay:PT2S}")
    fun poll() {
        if (!properties.enabled) return
        val capacity = properties.analysis.concurrency - active.size
        leases.claim(workerId, capacity).forEach { sessionId ->
            if (!active.add(sessionId)) return@forEach
            executor.submit {
                try {
                    processor.process(sessionId, workerId)
                } catch (_: Exception) {
                    logger.warn("Worksheet analysis worker failed with a sanitized processing error")
                } finally {
                    active.remove(sessionId)
                }
            }
        }
    }

    @PreDestroy
    fun shutdown() {
        executor.shutdownNow()
    }

    private companion object {
        val logger = LoggerFactory.getLogger(WorksheetAnalysisWorker::class.java)
    }
}
