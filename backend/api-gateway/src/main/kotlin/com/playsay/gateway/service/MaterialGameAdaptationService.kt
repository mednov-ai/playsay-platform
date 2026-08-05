package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialGameAdaptationRequest
import com.playsay.gateway.dto.MaterialGameAdaptationResponse
import com.playsay.gateway.entity.MaterialGameAdaptationEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.MaterialGameAdaptationRepo
import com.playsay.gateway.utils.MetaData
import java.time.Duration
import java.time.Instant
import java.security.MessageDigest
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

object MaterialGameAdaptationStatuses {
    const val PENDING = "PENDING"
    const val ANALYZING = "ANALYZING"
    const val PATCHING = "PATCHING"
    const val VALIDATING = "VALIDATING"
    const val READY_FOR_REVIEW = "READY_FOR_REVIEW"
    const val APPLIED = "APPLIED"
    const val ROLLED_BACK = "ROLLED_BACK"
    const val RETRY = "RETRY"
    const val FAILED = "FAILED"
}

object MaterialGameMechanicsValidation {
    const val PASSED = "PASSED"
    const val FAILED = "FAILED"
    const val REVALIDATION_REQUIRED = "REVALIDATION_REQUIRED"
    const val CURRENT_VALIDATOR_VERSION = "mechanics-v2"
}

@Component
class MaterialGameAdaptationService(
    private val repo: MaterialGameAdaptationRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val materialAssetService: MaterialAssetService,
    private val materialAssetUploadService: MaterialAssetUploadService,
    private val adapterClient: MaterialGameAdapterClient,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    @Transactional
    fun request(
        materialId: UUID,
        sourceAssetId: UUID,
        request: MaterialGameAdaptationRequest,
    ): MaterialGameAdaptationResponse {
        materialAssetService.requireHtmlGameAsset(materialId, sourceAssetId)
        val blockId = request.blockId.trim().take(120)
        if (blockId.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_EMPTY, "blockId")
        }
        val material = lessonMaterialRepo.lockById(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        requireBlock(material.document, blockId, sourceAssetId)
        val html = materialAssetService.storedAssetBytes(materialId, sourceAssetId).toString(Charsets.UTF_8)
        val compatibility = classifyHtmlGameCompatibility(html)
        val now = Instant.now()
        return repo.save(newJob(materialId, sourceAssetId, blockId, compatibility, html, now)).toResponse()
    }

    @Transactional(readOnly = true)
    fun status(materialId: UUID, sourceAssetId: UUID, jobId: UUID): MaterialGameAdaptationResponse {
        val job = repo.findById(jobId).orElse(null)
            ?.takeIf { it.materialId == materialId && it.sourceAssetId == sourceAssetId }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        return job.toResponse()
    }

    @Transactional
    fun claimNext(lease: Duration = Duration.ofMinutes(6)): UUID? {
        val now = Instant.now()
        val job = repo.findClaimable(
            readyStatuses = listOf(MaterialGameAdaptationStatuses.PENDING, MaterialGameAdaptationStatuses.RETRY),
            runningStatus = MaterialGameAdaptationStatuses.ANALYZING,
            now = now,
            pageable = PageRequest.of(0, 1),
        ).firstOrNull() ?: return null
        job.status = MaterialGameAdaptationStatuses.ANALYZING
        job.attempts += 1
        job.leaseUntil = now.plus(lease)
        job.updatedAt = now
        return repo.save(job).id
    }

    fun process(jobId: UUID) {
        val job = repo.findById(jobId).orElse(null) ?: return
        try {
            updateStage(jobId, MaterialGameAdaptationStatuses.PATCHING)
            val source = materialAssetService.storedAssetBytes(job.materialId, job.sourceAssetId).toString(Charsets.UTF_8)
            val adapted = adapterClient.adapt(source)
            if (
                !adapted.mechanicsEquivalent ||
                adapted.validatorVersion != MaterialGameMechanicsValidation.CURRENT_VALIDATOR_VERSION ||
                adapted.sourceHash != sha256(source)
            ) {
                throw GameAdapterClientException(
                    MetaData.ErrorCodes.GAME_ADAPTER_MECHANICS_CHANGED,
                    retryable = false,
                )
            }
            updateStage(jobId, MaterialGameAdaptationStatuses.VALIDATING)
            val adaptedAssetId = materialAssetUploadService.insertAdaptedHtmlGameAsset(
                materialId = job.materialId,
                sourceAssetId = job.sourceAssetId,
                bytes = adapted.html.toByteArray(Charsets.UTF_8),
                report = adapted.report,
                model = adapted.model,
                promptHash = adapted.promptHash,
            )
            complete(jobId, adaptedAssetId, adapted)
        } catch (exception: Exception) {
            logger.warn("HTML game adaptation failed jobId={} materialId={} assetId={}", jobId, job.materialId, job.sourceAssetId, exception)
            val adapterFailure = exception as? GameAdapterClientException
            fail(
                jobId,
                adapterFailure?.adapterErrorCode
                    ?: (exception as? ProjectResponseException)?.errorCode
                    ?: MetaData.ErrorCodes.GAME_ADAPTER_FAILED,
                retryable = adapterFailure?.retryable ?: false,
            )
        }
    }

    @Transactional
    fun apply(materialId: UUID, sourceAssetId: UUID, jobId: UUID): MaterialGameAdaptationResponse {
        val job = requireJob(materialId, sourceAssetId, jobId)
        val adaptedAssetId = job.adaptedAssetId
        if (
            job.status != MaterialGameAdaptationStatuses.READY_FOR_REVIEW ||
            adaptedAssetId == null ||
            job.mechanicsValidation != MaterialGameMechanicsValidation.PASSED ||
            job.validatorVersion != MaterialGameMechanicsValidation.CURRENT_VALIDATOR_VERSION
        ) {
            throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.GAME_ADAPTER_NOT_READY)
        }
        val material = lessonMaterialRepo.lockById(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val document = objectMapper.readTree(material.document).deepCopy<ObjectNode>()
        val block = findBlock(document, job.blockId)
            ?: throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.GAME_ADAPTER_SOURCE_CHANGED)
        val sourceReference = "material-asset:$sourceAssetId"
        val replacedJob = if (block.path("url").asText() == sourceReference) {
            null
        } else {
            verifiedAppliedJobBeingReplaced(block, job)
                ?: throw ProjectResponseException.localized(
                    HttpStatus.CONFLICT,
                    MetaData.ErrorCodes.GAME_ADAPTER_SOURCE_CHANGED,
                )
        }
        block.put("url", "material-asset:$adaptedAssetId")
        block.put("gameSyncCompatibility", "SDK_V1")
        block.put("gameAdaptationSourceAssetId", sourceAssetId.toString())
        block.put("gameAdaptationJobId", jobId.toString())
        material.document = objectMapper.writeValueAsString(document)
        material.updatedAt = Instant.now()
        lessonMaterialRepo.save(material)
        job.status = MaterialGameAdaptationStatuses.APPLIED
        job.updatedAt = Instant.now()
        replacedJob?.let {
            it.status = MaterialGameAdaptationStatuses.ROLLED_BACK
            it.updatedAt = job.updatedAt
            repo.save(it)
        }
        return repo.save(job).toResponse()
    }

    @Transactional
    fun revalidate(materialId: UUID, sourceAssetId: UUID, jobId: UUID): MaterialGameAdaptationResponse {
        val previous = requireJob(materialId, sourceAssetId, jobId)
        materialAssetService.requireHtmlGameAsset(materialId, sourceAssetId)
        val material = lessonMaterialRepo.lockById(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val block = findBlock(objectMapper.readTree(material.document), previous.blockId)
            ?: throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.GAME_ADAPTER_SOURCE_CHANGED)
        val currentAsset = block.path("url").asText()
        val sourceReference = "material-asset:$sourceAssetId"
        val adaptedReference = previous.adaptedAssetId?.let { "material-asset:$it" }
        if (
            currentAsset != sourceReference &&
            (adaptedReference == null || currentAsset != adaptedReference)
        ) {
            throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.GAME_ADAPTER_SOURCE_CHANGED)
        }
        val html = materialAssetService.storedAssetBytes(materialId, sourceAssetId).toString(Charsets.UTF_8)
        val compatibility = classifyHtmlGameCompatibility(html)
        return repo.save(
            newJob(
                materialId = materialId,
                sourceAssetId = sourceAssetId,
                blockId = previous.blockId,
                compatibility = compatibility,
                html = html,
                now = Instant.now(),
            ),
        ).toResponse()
    }

    @Transactional
    fun rollback(materialId: UUID, sourceAssetId: UUID, jobId: UUID): MaterialGameAdaptationResponse {
        val job = requireJob(materialId, sourceAssetId, jobId)
        val adaptedAssetId = job.adaptedAssetId
            ?: throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.GAME_ADAPTER_NOT_READY)
        val material = lessonMaterialRepo.lockById(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val document = objectMapper.readTree(material.document).deepCopy<ObjectNode>()
        val block = findBlock(document, job.blockId)
            ?.takeIf { it.path("url").asText() == "material-asset:$adaptedAssetId" }
            ?: throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.GAME_ADAPTER_SOURCE_CHANGED)
        block.put("url", "material-asset:$sourceAssetId")
        block.put("gameSyncCompatibility", job.compatibility)
        block.remove(listOf("gameAdaptationSourceAssetId", "gameAdaptationJobId"))
        material.document = objectMapper.writeValueAsString(document)
        material.updatedAt = Instant.now()
        lessonMaterialRepo.save(material)
        job.status = MaterialGameAdaptationStatuses.ROLLED_BACK
        job.updatedAt = Instant.now()
        return repo.save(job).toResponse()
    }

    @Transactional
    fun updateStage(jobId: UUID, status: String) {
        val job = repo.findById(jobId).orElse(null) ?: return
        job.status = status
        job.updatedAt = Instant.now()
        repo.save(job)
    }

    @Transactional
    fun complete(jobId: UUID, adaptedAssetId: UUID, result: GameAdapterResult) {
        val job = repo.findById(jobId).orElse(null) ?: return
        job.adaptedAssetId = adaptedAssetId
        job.status = MaterialGameAdaptationStatuses.READY_FOR_REVIEW
        job.compatibility = "SDK_V1"
        job.report = result.report
        job.model = result.model
        job.promptHash = result.promptHash
        job.mechanicsValidation = if (result.mechanicsEquivalent) {
            MaterialGameMechanicsValidation.PASSED
        } else {
            MaterialGameMechanicsValidation.FAILED
        }
        job.validatorVersion = result.validatorVersion
        job.sourceHash = result.sourceHash
        job.validationReport = result.validationReport
        job.nextAttemptAt = null
        job.leaseUntil = null
        job.lastErrorCode = null
        job.updatedAt = Instant.now()
        repo.save(job)
    }

    @Transactional
    fun fail(jobId: UUID, errorCode: String, retryable: Boolean = false) {
        val job = repo.findById(jobId).orElse(null) ?: return
        val exhausted = !retryable || job.attempts >= 3
        job.status = if (exhausted) MaterialGameAdaptationStatuses.FAILED else MaterialGameAdaptationStatuses.RETRY
        job.nextAttemptAt = if (exhausted) null else Instant.now().plusSeconds(30L * job.attempts.coerceAtLeast(1))
        job.leaseUntil = null
        job.lastErrorCode = errorCode
        job.updatedAt = Instant.now()
        repo.save(job)
    }

    private fun requireJob(materialId: UUID, sourceAssetId: UUID, jobId: UUID): MaterialGameAdaptationEntity =
        repo.findById(jobId).orElse(null)
            ?.takeIf { it.materialId == materialId && it.sourceAssetId == sourceAssetId }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)

    private fun requireBlock(document: String, blockId: String, assetId: UUID) {
        val root = runCatching { objectMapper.readTree(document) }.getOrNull()
        val block = root?.let { findBlock(it, blockId) }
        if (block?.path("type")?.asText() != "htmlGame" || block.path("url").asText() != "material-asset:$assetId") {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
    }

    private fun verifiedAppliedJobBeingReplaced(
        block: ObjectNode,
        replacement: MaterialGameAdaptationEntity,
    ): MaterialGameAdaptationEntity? {
        val previousJobId = runCatching {
            UUID.fromString(block.path("gameAdaptationJobId").asText())
        }.getOrNull() ?: return null
        val previous = repo.findById(previousJobId).orElse(null) ?: return null
        return previous.takeIf {
            it.id != replacement.id &&
                it.materialId == replacement.materialId &&
                it.sourceAssetId == replacement.sourceAssetId &&
                it.blockId == replacement.blockId &&
                it.status == MaterialGameAdaptationStatuses.APPLIED &&
                block.path("url").asText() == it.adaptedAssetId?.let { assetId -> "material-asset:$assetId" }
        }
    }

    private fun newJob(
        materialId: UUID,
        sourceAssetId: UUID,
        blockId: String,
        compatibility: String,
        html: String,
        now: Instant,
    ): MaterialGameAdaptationEntity {
        val alreadyCompatible = compatibility == "SDK_V1"
        return MaterialGameAdaptationEntity(
            id = UUID.randomUUID(),
            materialId = materialId,
            sourceAssetId = sourceAssetId,
            blockId = blockId,
            status = if (alreadyCompatible) {
                MaterialGameAdaptationStatuses.READY_FOR_REVIEW
            } else {
                MaterialGameAdaptationStatuses.PENDING
            },
            compatibility = compatibility,
            report = if (alreadyCompatible) "The game already uses Play&Say Game Sync v1." else null,
            mechanicsValidation = if (alreadyCompatible) {
                MaterialGameMechanicsValidation.PASSED
            } else {
                MaterialGameMechanicsValidation.REVALIDATION_REQUIRED
            },
            validatorVersion = if (alreadyCompatible) {
                MaterialGameMechanicsValidation.CURRENT_VALIDATOR_VERSION
            } else {
                null
            },
            sourceHash = sha256(html),
            validationReport = if (alreadyCompatible) {
                """{"checks":["source-identical"],"mechanicsEquivalent":true,"validatorVersion":"${MaterialGameMechanicsValidation.CURRENT_VALIDATOR_VERSION}"}"""
            } else {
                null
            },
            attempts = 0,
            nextAttemptAt = if (alreadyCompatible) null else now,
            createdAt = now,
            updatedAt = now,
        )
    }

    private fun findBlock(document: JsonNode, blockId: String): ObjectNode? {
        val pages = document.path("pages") as? ArrayNode ?: return null
        pages.forEach { page ->
            (page.path("blocks") as? ArrayNode)?.forEach { node ->
                val block = node as? ObjectNode ?: return@forEach
                if (block.path("id").asText() == blockId) return block
            }
        }
        return null
    }

    private companion object {
        val logger = LoggerFactory.getLogger(MaterialGameAdaptationService::class.java)
    }
}

private fun MaterialGameAdaptationEntity.toResponse() = MaterialGameAdaptationResponse(
    id = id,
    materialId = materialId,
    sourceAssetId = sourceAssetId,
    adaptedAssetId = adaptedAssetId,
    blockId = blockId,
    status = status,
    compatibility = compatibility,
    report = report,
    model = model,
    mechanicsValidation = mechanicsValidation,
    validatorVersion = validatorVersion,
    sourceHash = sourceHash,
    validationReport = validationReport?.let { runCatching { jacksonObjectMapper().readTree(it) }.getOrNull() },
    errorCode = lastErrorCode,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

private fun sha256(value: String): String =
    MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
