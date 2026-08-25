package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.contract.worksheetimport.model.WorksheetMaterializationAsset
import com.playsay.contract.worksheetimport.model.WorksheetMaterializationBundle
import com.playsay.gateway.client.WorksheetImportInternalClient
import com.playsay.gateway.entity.LessonMaterialEntity
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.entity.MaterialSourceAttachmentEntity
import com.playsay.gateway.entity.WorksheetImportMaterialLinkEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.repo.MaterialSourceAttachmentRepository
import com.playsay.gateway.repo.WorksheetImportMaterialLinkRepository
import com.playsay.gateway.utils.MetaData
import java.security.MessageDigest
import java.time.Clock
import java.util.HexFormat
import java.util.UUID
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class WorksheetFetchedAsset(
    val descriptor: WorksheetMaterializationAsset,
    val bytes: ByteArray,
    val storageKey: String,
)

interface WorksheetMaterializationPersistence {
    fun existingMaterialId(sessionId: UUID): UUID?
    fun persist(
        bundle: WorksheetMaterializationBundle,
        ownerUserId: UUID,
        document: JsonNode,
        sourceMeta: JsonNode,
        assets: List<WorksheetFetchedAsset>,
    ): UUID
}

@Service
class WorksheetMaterializationPersistenceService(
    private val links: WorksheetImportMaterialLinkRepository,
    private val materials: LessonMaterialRepo,
    private val materialAssets: MaterialAssetRepo,
    private val sourceAttachments: MaterialSourceAttachmentRepository,
    private val objectMapper: ObjectMapper,
    private val clock: Clock,
) : WorksheetMaterializationPersistence {
    @Transactional(readOnly = true)
    override fun existingMaterialId(sessionId: UUID): UUID? = links.findById(sessionId).orElse(null)?.materialId

    @Transactional
    override fun persist(
        bundle: WorksheetMaterializationBundle,
        ownerUserId: UUID,
        document: JsonNode,
        sourceMeta: JsonNode,
        assets: List<WorksheetFetchedAsset>,
    ): UUID {
        links.findById(bundle.sessionId).orElse(null)?.let { return it.materialId }
        val materialId = stableMaterialId(bundle.sessionId)
        val now = clock.instant()
        materials.saveAndFlush(
            LessonMaterialEntity(
                id = materialId,
                ownerTeacherUserId = ownerUserId,
                title = bundle.title.take(160),
                description = null,
                language = bundle.language.take(16),
                cefrLevel = bundle.cefrLevel,
                visibility = MetaData.MaterialVisibility.PRIVATE,
                status = MetaData.MaterialStatuses.DRAFT,
                document = objectMapper.writeValueAsString(document),
                sourceMeta = objectMapper.writeValueAsString(sourceMeta),
                scoringRubric = "{\"maxScore\":10}",
                topicTags = "[]",
                skillTags = "[]",
                createdAt = now,
                updatedAt = now,
            ),
        )
        materialAssets.saveAll(assets.filter { it.descriptor.learnerVisible }.map { asset ->
            MaterialAssetEntity(
                id = asset.descriptor.id,
                materialId = materialId,
                kind = "WORKSHEET_PAGE",
                storageKey = asset.storageKey,
                provider = "WORKSHEET_IMPORT",
                metadata = objectMapper.writeValueAsString(assetMetadata(asset.descriptor)),
                createdAt = now,
            )
        })
        sourceAttachments.saveAll(assets.filterNot { it.descriptor.learnerVisible }.map { asset ->
            MaterialSourceAttachmentEntity(
                id = asset.descriptor.id,
                materialId = materialId,
                importSessionId = bundle.sessionId,
                sourceId = asset.descriptor.sourceId,
                pageId = asset.descriptor.pageId,
                sourcePageNumber = asset.descriptor.sourcePageNumber,
                kind = if (asset.descriptor.pageId == null) "ORIGINAL_SOURCE" else "ANSWER_KEY_OR_REFERENCE_PAGE",
                fileName = asset.descriptor.fileName,
                mimeType = asset.descriptor.mimeType,
                byteSize = asset.descriptor.byteSize,
                checksumSha256 = asset.descriptor.checksumSha256,
                storageKey = asset.storageKey,
                metadata = objectMapper.writeValueAsString(assetMetadata(asset.descriptor)),
                createdAt = now,
            )
        })
        links.saveAndFlush(
            WorksheetImportMaterialLinkEntity(bundle.sessionId, materialId, bundle.ownerSubject, bundle.revision, now),
        )
        return materialId
    }

    private fun assetMetadata(asset: WorksheetMaterializationAsset) = objectMapper.createObjectNode().apply {
        put("sourceId", asset.sourceId.toString()); put("pageId", asset.pageId?.toString())
        put("sourcePageNumber", asset.sourcePageNumber); put("fileName", asset.fileName)
        put("mimeType", asset.mimeType); put("byteSize", asset.byteSize); put("checksumSha256", asset.checksumSha256)
    }

    private fun stableMaterialId(sessionId: UUID): UUID = UUID.nameUUIDFromBytes("worksheet-material:$sessionId".toByteArray())
}

@Service
class WorksheetMaterializationService(
    private val client: WorksheetImportInternalClient,
    private val persistence: WorksheetMaterializationPersistence,
    private val storage: MaterialObjectStorage,
    private val catalog: LessonMaterialCatalogService,
    private val documentValidator: WorksheetMaterialDocumentValidator,
    private val objectMapper: ObjectMapper,
) {
    fun materialize(authentication: JwtAuthenticationToken, sessionId: UUID, revision: Long, rightsConfirmed: Boolean): UUID {
        catalog.requireMaterialManager(authentication)
        if (!rightsConfirmed) invalid()
        val bearer = authentication.token.tokenValue
        persistence.existingMaterialId(sessionId)?.let { materialId ->
            runCatching { client.acknowledgeMaterialization(sessionId, revision, materialId, bearer) }
            return materialId
        }
        val bundle = client.materializationBundle(sessionId, revision, true, bearer)
        if (bundle.sessionId != sessionId || bundle.revision != revision || bundle.ownerSubject != authentication.token.subject) invalid()
        val document = objectMapper.valueToTree<JsonNode>(bundle.document)
        val sourceMeta = objectMapper.valueToTree<JsonNode>(bundle.sourceMeta)
        documentValidator.validate(document)
        val materialId = UUID.nameUUIDFromBytes("worksheet-material:$sessionId".toByteArray())
        val fetched = bundle.assets.map { asset ->
            val bytes = client.materializationAsset(sessionId, revision, asset.id, bearer)
            validateAsset(asset, bytes)
            WorksheetFetchedAsset(asset, bytes, "material-assets/$materialId/${asset.id}.${extension(asset.mimeType)}")
        }
        val written = mutableListOf<String>()
        try {
            fetched.forEach { asset ->
                storage.putObject(asset.storageKey, asset.bytes, asset.descriptor.mimeType)
                written += asset.storageKey
            }
            val persistedId = persistence.persist(bundle, catalog.currentUserId(authentication), document, sourceMeta, fetched)
            runCatching { client.acknowledgeMaterialization(sessionId, revision, persistedId, bearer) }
            return persistedId
        } catch (failure: RuntimeException) {
            val winner = persistence.existingMaterialId(sessionId)
            if (winner != null) {
                runCatching { client.acknowledgeMaterialization(sessionId, revision, winner, bearer) }
                return winner
            }
            written.forEach { key -> runCatching { storage.deleteObject(key) } }
            throw failure
        }
    }

    private fun validateAsset(asset: WorksheetMaterializationAsset, bytes: ByteArray) {
        if (bytes.size.toLong() != asset.byteSize || bytes.isEmpty()) invalid()
        val digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))
        if (!digest.equals(asset.checksumSha256, ignoreCase = true)) invalid()
        if (asset.learnerVisible && asset.mimeType !in setOf("image/png", "image/jpeg", "image/webp")) invalid()
    }

    private fun extension(mimeType: String) = when (mimeType) {
        "image/png" -> "png"; "image/jpeg" -> "jpg"; "image/webp" -> "webp"; "application/pdf" -> "pdf"; else -> "bin"
    }

    private fun invalid(): Nothing = throw ProjectResponseException.localized(HttpStatus.UNPROCESSABLE_ENTITY, MetaData.ErrorCodes.MATERIAL_DOCUMENT_INVALID)
}
