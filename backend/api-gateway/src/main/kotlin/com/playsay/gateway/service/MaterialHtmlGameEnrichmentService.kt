package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialHtmlGameEnrichmentRequest
import com.playsay.gateway.dto.MaterialHtmlGameEnrichmentResponse
import com.playsay.gateway.entity.MaterialHtmlGameEnrichmentEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.MaterialHtmlGameEnrichmentRepo
import com.playsay.gateway.utils.MetaData
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

object MaterialHtmlGameEnrichmentStatuses {
    const val PENDING = "PENDING"
    const val RUNNING = "RUNNING"
    const val RETRY = "RETRY"
    const val READY = "READY"
    const val FAILED = "FAILED"
}

@Component
class MaterialHtmlGameEnrichmentService(
    private val enrichmentRepo: MaterialHtmlGameEnrichmentRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val materialAssetService: MaterialAssetService,
    private val metadataService: MaterialHtmlGameMetadataService,
    private val aiService: MaterialHtmlGameAiService,
    private val imageGenerationService: MaterialImageGenerationService,
    private val gameIconAssetService: MaterialGameIconAssetService,
    transactionManager: PlatformTransactionManager,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    private val transactionTemplate = TransactionTemplate(transactionManager)
    @Transactional
    fun request(materialId: UUID, assetId: UUID, request: MaterialHtmlGameEnrichmentRequest): MaterialHtmlGameEnrichmentResponse {
        materialAssetService.requireHtmlGameAsset(materialId, assetId)
        val blockId = request.blockId.trim().take(120)
        if (blockId.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_EMPTY, "blockId")
        }
        val preferredTitle = request.preferredTitle?.trim()?.take(160)?.takeIf { it.isNotEmpty() }
        if (preferredTitle != null && !MaterialHtmlGameTitlePolicy.isEnglish(preferredTitle)) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.MATERIAL_HTML_GAME_TITLE_NOT_ENGLISH)
        }
        val material = lessonMaterialRepo.lockById(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        requireHtmlGameBlock(material.document, blockId, assetId)
        val now = Instant.now()
        val job = enrichmentRepo.findByMaterialIdAndAssetIdAndBlockId(materialId, assetId, blockId)
            ?: MaterialHtmlGameEnrichmentEntity(
                id = UUID.randomUUID(),
                materialId = materialId,
                assetId = assetId,
                blockId = blockId,
                createdAt = now,
            )
        job.status = MaterialHtmlGameEnrichmentStatuses.PENDING
        job.preferredTitle = preferredTitle
        job.attempts = 0
        job.nextAttemptAt = now
        job.leaseUntil = null
        job.lastErrorCode = null
        job.updatedAt = now
        return enrichmentRepo.save(job).toResponse()
    }

    @Transactional(readOnly = true)
    fun status(materialId: UUID, assetId: UUID, blockId: String): MaterialHtmlGameEnrichmentResponse {
        materialAssetService.requireHtmlGameAsset(materialId, assetId)
        val cleanBlockId = blockId.trim().take(120)
        return enrichmentRepo.findByMaterialIdAndAssetIdAndBlockId(materialId, assetId, cleanBlockId)?.toResponse()
            ?: MaterialHtmlGameEnrichmentResponse(assetId, cleanBlockId, "IDLE", null, null, null, null, null)
    }

    @Transactional
    fun claimNext(lease: Duration = Duration.ofMinutes(3)): UUID? {
        val now = Instant.now()
        val job = enrichmentRepo.findClaimable(
            readyStatuses = listOf(MaterialHtmlGameEnrichmentStatuses.PENDING, MaterialHtmlGameEnrichmentStatuses.RETRY),
            runningStatus = MaterialHtmlGameEnrichmentStatuses.RUNNING,
            now = now,
            pageable = PageRequest.of(0, 1),
        ).firstOrNull() ?: return null
        job.status = MaterialHtmlGameEnrichmentStatuses.RUNNING
        job.attempts += 1
        job.leaseUntil = now.plus(lease)
        job.updatedAt = now
        enrichmentRepo.save(job)
        return job.id
    }

    fun process(jobId: UUID) {
        val job = enrichmentRepo.findById(jobId).orElse(null) ?: return
        try {
            val asset = materialAssetService.requireHtmlGameAsset(job.materialId, job.assetId)
            val bytes = materialAssetService.storedAssetBytes(job.materialId, job.assetId)
            val extracted = metadataService.extract(bytes, asset.metadataFileName(objectMapper))
            val preferredTitle = job.preferredTitle
            val aiInput = MaterialHtmlGameAiInput(
                candidateTitle = preferredTitle ?: extracted.title,
                titleNeedsAi = preferredTitle == null && extracted.titleNeedsAi,
                context = extracted.context,
            )
            val analysis = aiService.analyze(aiInput)
            val title = preferredTitle ?: analysis.title
            val titleSource = if (preferredTitle != null) "USER" else if (extracted.titleNeedsAi) "AI" else extracted.titleSource
            val generated = imageGenerationService.generate(MaterialImageGenerationInput(prompt = analysis.iconPrompt, alt = title))
            val iconAssetId = gameIconAssetService.upsert(
                materialId = job.materialId,
                previousAssetId = job.iconAssetId,
                title = title,
                iconPrompt = analysis.iconPrompt,
                generated = generated,
            )
            transactionTemplate.executeWithoutResult { complete(jobId, title, titleSource, iconAssetId) }
        } catch (exception: Exception) {
            logger.warn("HTML game enrichment failed jobId={} materialId={} assetId={}", jobId, job.materialId, job.assetId, exception)
            val errorCode = (exception as? ProjectResponseException)?.errorCode ?: MetaData.ErrorCodes.AI_IMAGE_GENERATION_FAILED
            transactionTemplate.executeWithoutResult { fail(jobId, errorCode) }
        }
    }

    @Transactional
    fun complete(jobId: UUID, title: String, titleSource: String, iconAssetId: UUID) {
        val job = enrichmentRepo.findById(jobId).orElse(null) ?: return
        val material = lessonMaterialRepo.lockById(job.materialId)
            ?: return fail(jobId, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val document = objectMapper.readTree(material.document).deepCopy<ObjectNode>()
        val target = findBlockAndPage(document, job.blockId, job.assetId)
            ?: return fail(jobId, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val currentSource = target.block.path("gameTitleSource").asText()
        if (currentSource != "USER") {
            target.block.put("title", title)
            target.block.put("gameTitleSource", titleSource)
            if (target.page.path("layout").asText() == "HTML_GAME") {
                target.page.put("title", title)
            }
        }
        target.block.put("gameIconUrl", "material-asset:$iconAssetId")
        material.document = objectMapper.writeValueAsString(document)
        material.updatedAt = Instant.now()
        lessonMaterialRepo.save(material)

        job.status = MaterialHtmlGameEnrichmentStatuses.READY
        job.resolvedTitle = if (currentSource == "USER") target.block.path("title").asText() else title
        job.titleSource = if (currentSource == "USER") "USER" else titleSource
        job.iconAssetId = iconAssetId
        job.nextAttemptAt = null
        job.leaseUntil = null
        job.lastErrorCode = null
        job.updatedAt = Instant.now()
        enrichmentRepo.save(job)
    }

    @Transactional
    fun fail(jobId: UUID, errorCode: String) {
        val job = enrichmentRepo.findById(jobId).orElse(null) ?: return
        val exhausted = job.attempts >= 3
        job.status = if (exhausted) MaterialHtmlGameEnrichmentStatuses.FAILED else MaterialHtmlGameEnrichmentStatuses.RETRY
        job.nextAttemptAt = if (exhausted) null else Instant.now().plusSeconds(15L * job.attempts.coerceAtLeast(1))
        job.leaseUntil = null
        job.lastErrorCode = errorCode
        job.updatedAt = Instant.now()
        enrichmentRepo.save(job)
    }

    private fun requireHtmlGameBlock(documentJson: String, blockId: String, assetId: UUID) {
        val document = runCatching { objectMapper.readTree(documentJson) }.getOrNull()
        if (document == null || findBlockAndPage(document, blockId, assetId) == null) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
    }

    private fun findBlockAndPage(document: JsonNode, blockId: String, assetId: UUID): HtmlGameBlockTarget? {
        val pages = document.path("pages") as? ArrayNode ?: return null
        pages.forEach { pageNode ->
            val page = pageNode as? ObjectNode ?: return@forEach
            val blocks = page.path("blocks") as? ArrayNode ?: return@forEach
            blocks.forEach { blockNode ->
                val block = blockNode as? ObjectNode ?: return@forEach
                if (block.path("id").asText() == blockId &&
                    block.path("type").asText() == "htmlGame" &&
                    block.path("url").asText() == "material-asset:$assetId"
                ) return HtmlGameBlockTarget(page, block)
            }
        }
        return null
    }

    private data class HtmlGameBlockTarget(val page: ObjectNode, val block: ObjectNode)

    private companion object {
        val logger = LoggerFactory.getLogger(MaterialHtmlGameEnrichmentService::class.java)
    }
}

private fun MaterialHtmlGameEnrichmentEntity.toResponse(): MaterialHtmlGameEnrichmentResponse =
    MaterialHtmlGameEnrichmentResponse(
        assetId = assetId,
        blockId = blockId,
        status = status,
        title = resolvedTitle ?: preferredTitle,
        titleSource = titleSource,
        iconAssetId = iconAssetId,
        gameIconUrl = iconAssetId?.let { "material-asset:$it" },
        errorCode = lastErrorCode,
    )

private fun com.playsay.gateway.entity.MaterialAssetEntity.metadataFileName(objectMapper: ObjectMapper): String? =
    runCatching { objectMapper.readTree(metadata).path("fileName").asText(null) }.getOrNull()
