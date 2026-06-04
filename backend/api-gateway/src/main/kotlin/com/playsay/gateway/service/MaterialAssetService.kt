package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialAssetResponse
import com.playsay.gateway.dto.MaterialAssetUpdateRequest
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.utils.MetaData
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component

private typealias StoredMaterialAsset = MaterialAssetEntity

private val materialImageTagStopWords = setOf(
    "a",
    "an",
    "and",
    "background",
    "child",
    "children",
    "friendly",
    "for",
    "image",
    "illustration",
    "of",
    "picture",
    "the",
    "white",
    "workbook",
)

@Component
class MaterialAssetService(
    private val materialAssetRepo: MaterialAssetRepo,
    private val materialObjectStorage: MaterialObjectStorage,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    fun list(materialId: UUID): List<MaterialAssetResponse> =
        materialAssetRepo.findByMaterialIdOrderByCreatedAtDesc(materialId)
            .map { asset -> asset.toResponse(objectMapper) }

    fun content(materialId: UUID, assetId: UUID): ResponseEntity<ByteArray> {
        val asset = findAsset(assetId)
            ?.takeIf { found -> found.materialId == materialId }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_ASSET_NOT_FOUND)
        val storageKey = asset.storageKey?.trim()?.takeIf { key -> key.isNotEmpty() }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_ASSET_CONTENT_NOT_FOUND)
        val content = try {
            materialObjectStorage.getObject(storageKey)
        } catch (exception: MaterialObjectNotFoundException) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_ASSET_NOT_FOUND)
        } catch (exception: MaterialObjectStorageException) {
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.MATERIAL_ASSET_STORAGE_FAILED)
        }
        val contentType = runCatching { MediaType.parseMediaType(content.contentType) }
            .getOrDefault(MediaType.APPLICATION_OCTET_STREAM)
        return ResponseEntity.ok()
            .contentType(contentType)
            .contentLength(content.contentLength)
            .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePrivate())
            .body(content.bytes)
    }

    fun update(materialId: UUID, assetId: UUID, request: MaterialAssetUpdateRequest): MaterialAssetResponse {
        val asset = findAsset(assetId)
            ?.takeIf { found -> found.materialId == materialId }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_ASSET_NOT_FOUND)
        val metadata = runCatching { objectMapper.readTree(asset.metadata).deepCopy<ObjectNode>() }
            .getOrElse { objectMapper.createObjectNode() }

        request.tags?.let { tags ->
            metadata.replace("tags", normalizeMaterialImageTags(tags))
        }

        val entity = materialAssetRepo.findById(assetId).orElseThrow()
        entity.metadata = objectMapper.writeValueAsString(metadata)
        materialAssetRepo.save(entity)

        return requireNotNull(findAsset(assetId)).toResponse(objectMapper)
    }

    fun findAssets(materialId: UUID): List<MaterialAssetEntity> =
        materialAssetRepo.findByMaterialId(materialId)

    fun findYoutubeThumbnailAsset(
        materialId: UUID,
        blockId: String,
        videoId: String,
    ): MaterialAssetResponse? =
        materialAssetRepo.findByMaterialId(materialId)
            .firstOrNull { asset ->
                asset.kind == "VIDEO_THUMBNAIL" &&
                    asset.provider == "YOUTUBE" &&
                    runCatching { objectMapper.readTree(asset.metadata) }.getOrNull()?.let { metadata ->
                        metadata.path("blockId").asText() == blockId &&
                            metadata.path("videoId").asText() == videoId &&
                            asset.storageKey?.isNotBlank() == true
                    } == true
            }
            ?.toResponse(objectMapper)

    fun insertYoutubeThumbnailAsset(
        materialId: UUID,
        assetId: UUID,
        blockId: String,
        videoId: String,
        sourceThumbnailUrl: String,
        storageKey: String,
        contentType: String?,
        byteSize: Long?,
    ): MaterialAssetResponse =
        materialAssetRepo.saveAndFlush(
            MaterialAssetEntity(
                id = assetId,
                materialId = materialId,
                kind = "VIDEO_THUMBNAIL",
                storageKey = storageKey,
                externalUrl = null,
                provider = "YOUTUBE",
                metadata = objectMapper.writeValueAsString(
                    objectMapper.createObjectNode().apply {
                        put("blockId", blockId)
                        put("videoId", videoId)
                        put("sourceThumbnailUrl", sourceThumbnailUrl)
                        contentType?.let { value -> put("contentType", value) }
                        byteSize?.let { value -> put("byteSize", value) }
                    },
                ),
                createdAt = Instant.now(),
            ),
        ).toResponse(objectMapper)

    internal fun upsertGeneratedImageAsset(
        materialId: UUID,
        target: MaterialImageTarget,
        generated: GeneratedMaterialImage,
    ): UUID {
        val previousAsset = target.previousAssetId
            ?.let(::findAsset)
            ?.takeIf { asset -> asset.materialId == materialId && asset.storageKey?.isNotBlank() == true }
        if (previousAsset != null) {
            replaceGeneratedImageAsset(previousAsset, target, generated)
            return previousAsset.id
        }
        return insertGeneratedImageAsset(materialId, target, generated)
    }

    fun cleanupReplacedGeneratedAssets(materialId: UUID, assetIds: List<UUID>) {
        assetIds.forEach { assetId ->
            val asset = findAsset(assetId)?.takeIf { found -> found.materialId == materialId } ?: return@forEach
            asset.storageKey?.trim()?.takeIf { key -> key.isNotEmpty() }?.let { key ->
                runCatching { materialObjectStorage.deleteObject(key) }
            }
            runCatching { materialAssetRepo.deleteByIdAndMaterialId(assetId, materialId) }
        }
    }

    private fun findAsset(assetId: UUID): StoredMaterialAsset? =
        materialAssetRepo.findById(assetId).orElse(null)

    private fun insertGeneratedImageAsset(
        materialId: UUID,
        target: MaterialImageTarget,
        generated: GeneratedMaterialImage,
    ): UUID {
        val id = UUID.randomUUID()
        val storageKey = "material-assets/$materialId/$id.${generated.mimeType.materialImageExtension()}"
        try {
            materialObjectStorage.putObject(storageKey, generated.bytes, generated.mimeType)
            materialAssetRepo.saveAndFlush(
                MaterialAssetEntity(
                    id = id,
                    materialId = materialId,
                    kind = "GENERATED_IMAGE",
                    storageKey = storageKey,
                    externalUrl = null,
                    provider = "AI",
                    metadata = objectMapper.writeValueAsString(generatedImageMetadata(target, generated, storageKey)),
                    createdAt = Instant.now(),
                ),
            )
        } catch (exception: MaterialObjectStorageException) {
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.MATERIAL_ASSET_STORAGE_FAILED)
        } catch (exception: RuntimeException) {
            runCatching { materialObjectStorage.deleteObject(storageKey) }
            throw exception
        }
        return id
    }

    private fun replaceGeneratedImageAsset(
        asset: StoredMaterialAsset,
        target: MaterialImageTarget,
        generated: GeneratedMaterialImage,
    ) {
        val storageKey = requireNotNull(asset.storageKey).trim()
        try {
            materialObjectStorage.putObject(storageKey, generated.bytes, generated.mimeType)
            val existingTags = materialAssetTags(asset)
            asset.kind = "GENERATED_IMAGE"
            asset.externalUrl = null
            asset.provider = "AI"
            asset.metadata = objectMapper.writeValueAsString(generatedImageMetadata(target, generated, storageKey, existingTags))
            materialAssetRepo.save(asset)
        } catch (exception: MaterialObjectStorageException) {
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.MATERIAL_ASSET_STORAGE_FAILED)
        }
    }

    private fun generatedImageMetadata(
        target: MaterialImageTarget,
        generated: GeneratedMaterialImage,
        storageKey: String,
        existingTags: Iterable<String> = emptyList(),
    ): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("targetType", target.targetType)
            put("blockId", target.blockId)
            put("targetId", target.targetId)
            put("title", target.title)
            target.left?.let { value -> put("left", value) }
            target.right?.let { value -> put("right", value) }
            put("imageAlt", target.imageAlt)
            put("sourcePrompt", target.imagePrompt)
            put("sourceAlt", target.imageAlt)
            put("prompt", generated.prompt)
            put("model", generated.model)
            put("mimeType", generated.mimeType)
            put("storageKey", storageKey)
            put("byteSize", generated.bytes.size)
            replace("tags", generatedImageTags(target, generated, existingTags))
            generated.revisedPrompt?.let { value -> put("revisedPrompt", value) }
        }

    private fun generatedImageTags(
        target: MaterialImageTarget,
        generated: GeneratedMaterialImage,
        existingTags: Iterable<String> = emptyList(),
    ): ArrayNode {
        val tags = linkedSetOf<String>()
        fun addTag(value: String?) {
            val clean = value?.trim()?.lowercase()?.replace(Regex("""[^\p{L}\p{N}-]+"""), "-")?.trim('-').orEmpty()
            if (clean.length in 2..40 && clean !in materialImageTagStopWords) {
                tags.add(clean)
            }
        }

        existingTags.forEach(::addTag)
        addTag(target.targetType)
        addTag(target.title)
        addTag(target.left)
        addTag(target.right)
        addTag(target.imageAlt)
        materialImageTagCandidates(target.imagePrompt).forEach(::addTag)
        materialImageTagCandidates(generated.revisedPrompt).forEach(::addTag)

        return normalizeMaterialImageTags(tags)
    }

    private fun materialAssetTags(asset: StoredMaterialAsset): List<String> =
        runCatching { objectMapper.readTree(asset.metadata) }
            .getOrNull()
            ?.get("tags")
            ?.takeIf { node -> node.isArray }
            ?.mapNotNull { tag -> tag.takeIf { it.isTextual }?.asText() }
            .orEmpty()

    private fun materialImageTagCandidates(value: String?): List<String> =
        value.orEmpty()
            .split(Regex("""[^\p{L}\p{N}-]+"""))
            .map { token -> token.trim() }
            .filter { token -> token.length in 2..40 }

    private fun normalizeMaterialImageTags(values: Iterable<String>): ArrayNode {
        val tags = linkedSetOf<String>()
        values.forEach { value ->
            val clean = value.trim().lowercase().replace(Regex("""[^\p{L}\p{N}-]+"""), "-").trim('-')
            if (clean.length in 2..40 && clean !in materialImageTagStopWords) {
                tags.add(clean)
            }
        }
        return objectMapper.createArrayNode().apply {
            tags.take(16).forEach { tag -> add(tag) }
        }
    }
}

private fun StoredMaterialAsset.toResponse(objectMapper: ObjectMapper): MaterialAssetResponse =
    MaterialAssetResponse(
        id = id,
        materialId = materialId,
        kind = kind,
        storageKey = storageKey,
        externalUrl = externalUrl,
        contentUrl = storageKey?.takeIf { key -> key.isNotBlank() }?.let {
            "/api/materials/$materialId/assets/$id/content"
        },
        provider = provider,
        metadata = objectMapper.readTree(metadata),
        createdAt = createdAt,
    )

private fun String.materialImageExtension(): String =
    when (lowercase()) {
        "image/jpeg", "image/jpg" -> "jpg"
        "image/png" -> "png"
        "image/webp" -> "webp"
        "image/svg+xml" -> "svg"
        else -> "bin"
    }
