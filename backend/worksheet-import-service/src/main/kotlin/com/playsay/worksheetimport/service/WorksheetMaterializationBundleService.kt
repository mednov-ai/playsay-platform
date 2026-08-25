package com.playsay.worksheetimport.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.playsay.worksheetimport.domain.WORKSHEET_MATERIAL_BUNDLE_VERSION
import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.domain.WorksheetMaterializationAsset
import com.playsay.worksheetimport.domain.WorksheetMaterializationBundle
import com.playsay.worksheetimport.domain.WorksheetPageRole
import com.playsay.worksheetimport.domain.WorksheetReview
import com.playsay.worksheetimport.entity.WorksheetImportPageEntity
import com.playsay.worksheetimport.entity.WorksheetImportSourceEntity
import com.playsay.worksheetimport.repo.WorksheetImportPageRepository
import com.playsay.worksheetimport.repo.WorksheetImportSessionRepository
import com.playsay.worksheetimport.repo.WorksheetImportSourceRepository
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

class WorksheetMaterializationBlockedException : RuntimeException("Worksheet import is not ready for materialization.")
class WorksheetMaterializationConflictException : RuntimeException("Worksheet import has a conflicting material acknowledgement.")

@Service
class WorksheetMaterializationBundleService(
    private val sessions: WorksheetImportSessionRepository,
    private val sources: WorksheetImportSourceRepository,
    private val pages: WorksheetImportPageRepository,
    private val storage: WorksheetStagingStorage,
    private val objectMapper: ObjectMapper,
    private val reviewValidator: WorksheetReviewValidator,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    fun bundle(sessionId: UUID, expectedRevision: Long, rightsConfirmed: Boolean): WorksheetMaterializationBundle {
        val session = sessions.findById(sessionId).orElseThrow(::WorksheetSessionNotFoundException)
        if (!rightsConfirmed || session.revision != expectedRevision || session.status != WorksheetImportStatus.READY) {
            throw WorksheetMaterializationBlockedException()
        }
        val review = session.review?.let { objectMapper.readValue(it, WorksheetReview::class.java) }
            ?: throw WorksheetMaterializationBlockedException()
        val sourceEntities = sources.findAllBySessionIdOrderBySourceOrder(sessionId)
        val pageEntities = pages.findAllBySessionIdOrderByPageOrder(sessionId)
        if (reviewValidator.blockers(review, pageEntities.map { it.id }).isNotEmpty()) throw WorksheetMaterializationBlockedException()
        val assets = assets(sessionId, expectedRevision, sourceEntities, pageEntities, review)
        val document = document(review, pageEntities, assets)
        val sourceMeta = objectMapper.createObjectNode().apply {
            put("kind", "WORKSHEET_PHOTO_IMPORT")
            put("importSessionId", sessionId.toString())
            put("importRevision", expectedRevision)
            put("sourceNote", session.sourceNote)
            put("attribution", review.attribution)
            put("rightsNote", review.rightsNote)
            put("rightsConfirmed", true)
            put("watermarksPreserved", true)
        }
        return WorksheetMaterializationBundle(
            version = WORKSHEET_MATERIAL_BUNDLE_VERSION,
            sessionId = sessionId,
            revision = expectedRevision,
            ownerSubject = session.ownerSubject,
            title = session.title,
            language = session.language,
            cefrLevel = session.cefrLevel,
            document = document,
            sourceMeta = sourceMeta,
            assets = assets,
        )
    }

    @Transactional(readOnly = true)
    fun asset(sessionId: UUID, expectedRevision: Long, assetId: UUID): WorksheetStagingContent {
        val session = sessions.findById(sessionId).orElseThrow(::WorksheetSessionNotFoundException)
        if (session.revision != expectedRevision || session.status !in setOf(WorksheetImportStatus.READY, WorksheetImportStatus.MATERIALIZED)) {
            throw WorksheetMaterializationBlockedException()
        }
        val sourceEntities = sources.findAllBySessionIdOrderBySourceOrder(sessionId)
        val pageEntities = pages.findAllBySessionIdOrderByPageOrder(sessionId)
        val review = session.review?.let { objectMapper.readValue(it, WorksheetReview::class.java) } ?: throw WorksheetMaterializationBlockedException()
        val matched = assets(sessionId, expectedRevision, sourceEntities, pageEntities, review).singleOrNull { it.id == assetId }
            ?: throw WorksheetStagingNotFoundException()
        return storage.get(matched.contentPath)
    }

    @Transactional
    fun acknowledge(sessionId: UUID, revision: Long, materialId: UUID): UUID {
        val session = sessions.lockById(sessionId) ?: throw WorksheetSessionNotFoundException()
        if (session.materialId != null) {
            if (session.materialId != materialId) throw WorksheetMaterializationConflictException()
            return materialId
        }
        if (session.revision != revision || session.status != WorksheetImportStatus.READY) throw WorksheetMaterializationBlockedException()
        session.materialId = materialId
        session.status = WorksheetImportStatus.MATERIALIZED
        session.updatedAt = clock.instant()
        return materialId
    }

    private fun assets(
        sessionId: UUID,
        revision: Long,
        sourceEntities: List<WorksheetImportSourceEntity>,
        pageEntities: List<WorksheetImportPageEntity>,
        review: WorksheetReview,
    ): List<WorksheetMaterializationAsset> {
        val roles = review.pages.associate { it.id to it.role }
        val originals = sourceEntities.filter { it.kind.name == "PDF" }.map { source ->
            WorksheetMaterializationAsset(
                id = stableId(sessionId, revision, "source:${source.id}"), pageId = null, sourceId = source.id, sourcePageNumber = null,
                contentPath = source.storageKey, fileName = source.fileName, mimeType = source.mimeType,
                byteSize = source.byteSize, checksumSha256 = source.checksumSha256, learnerVisible = false,
            )
        }
        val rasters = pageEntities.map { page ->
            val source = sourceEntities.first { it.id == page.sourceId }
            WorksheetMaterializationAsset(
                id = stableId(sessionId, revision, "page:${page.id}"), pageId = page.id, sourceId = page.sourceId,
                sourcePageNumber = page.sourcePageNumber, contentPath = page.rasterStorageKey,
                fileName = page.sourcePageNumber?.let { "${source.fileName}-page-$it.png" } ?: source.fileName,
                mimeType = page.rasterMimeType, byteSize = page.rasterByteSize, checksumSha256 = page.rasterChecksumSha256,
                learnerVisible = roles[page.id] != WorksheetPageRole.ANSWER_KEY,
            )
        }
        return originals + rasters
    }

    private fun document(
        review: WorksheetReview,
        pages: List<WorksheetImportPageEntity>,
        assets: List<WorksheetMaterializationAsset>,
    ): JsonNode = objectMapper.createObjectNode().apply {
        put("schemaVersion", 2)
        putArray("pages").also { output ->
            review.pages.filter { it.role != WorksheetPageRole.ANSWER_KEY }.forEach { reviewed ->
                val page = pages.first { it.id == reviewed.id }
                val asset = assets.first { it.pageId == page.id }
                output.add(
                    if (reviewed.groups.isEmpty()) staticPage(reviewed.id, asset.id)
                    else worksheetPage(reviewed.id, page, asset.id, reviewed.groups),
                )
            }
        }
    }

    private fun staticPage(pageId: UUID, assetId: UUID): ObjectNode = objectMapper.createObjectNode().apply {
        put("id", pageId.toString()); put("title", "Worksheet page"); put("layout", "STATIC_IMAGE")
        putArray("blocks").add(objectMapper.createObjectNode().apply {
            put("id", "block-$pageId"); put("type", "image"); put("title", "Worksheet page")
            put("url", "material-asset:$assetId"); put("alt", "Worksheet page"); put("caption", "")
            put("objectFit", "contain"); put("imageSize", "FULL")
        })
    }

    private fun worksheetPage(pageId: UUID, page: WorksheetImportPageEntity, assetId: UUID, groups: List<com.playsay.worksheetimport.domain.WorksheetInteractionGroup>): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("id", pageId.toString()); put("title", "Worksheet page"); put("layout", "WORKSHEET")
            putArray("blocks").add(objectMapper.createObjectNode().apply {
                put("id", "worksheet-$pageId"); put("type", "interactiveWorksheet")
                put("sourceAsset", "material-asset:$assetId"); put("intrinsicWidth", page.width); put("intrinsicHeight", page.height)
                put("alt", "Worksheet page")
                set<JsonNode>("groups", objectMapper.valueToTree(groups))
            })
        }

    private fun stableId(sessionId: UUID, revision: Long, identity: String): UUID =
        UUID.nameUUIDFromBytes("$sessionId:$revision:$identity".toByteArray(StandardCharsets.UTF_8))
}
