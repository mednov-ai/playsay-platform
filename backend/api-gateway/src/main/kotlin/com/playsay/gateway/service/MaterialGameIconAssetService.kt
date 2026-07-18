package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.repo.MaterialAssetRepo
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Component

@Component
class MaterialGameIconAssetService(
    private val materialAssetRepo: MaterialAssetRepo,
    private val materialObjectStorage: MaterialObjectStorage,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    fun upsert(
        materialId: UUID,
        previousAssetId: UUID?,
        title: String,
        iconPrompt: String,
        generated: GeneratedMaterialImage,
    ): UUID {
        val previous = previousAssetId
            ?.let { materialAssetRepo.findById(it).orElse(null) }
            ?.takeIf { asset -> asset.materialId == materialId && asset.kind == "GAME_ICON" && asset.storageKey?.isNotBlank() == true }
        if (previous != null) {
            val storageKey = requireNotNull(previous.storageKey)
            materialObjectStorage.putObject(storageKey, generated.bytes, generated.mimeType)
            previous.provider = "AI"
            previous.metadata = objectMapper.writeValueAsString(metadata(title, iconPrompt, generated, storageKey))
            materialAssetRepo.save(previous)
            return previous.id
        }

        val id = UUID.randomUUID()
        val storageKey = "material-assets/$materialId/$id.${generated.mimeType.materialImageExtension()}"
        try {
            materialObjectStorage.putObject(storageKey, generated.bytes, generated.mimeType)
            materialAssetRepo.saveAndFlush(
                MaterialAssetEntity(
                    id = id,
                    materialId = materialId,
                    kind = "GAME_ICON",
                    storageKey = storageKey,
                    provider = "AI",
                    metadata = objectMapper.writeValueAsString(metadata(title, iconPrompt, generated, storageKey)),
                    createdAt = Instant.now(),
                ),
            )
        } catch (exception: RuntimeException) {
            runCatching { materialObjectStorage.deleteObject(storageKey) }
            throw exception
        }
        return id
    }

    private fun metadata(
        title: String,
        iconPrompt: String,
        generated: GeneratedMaterialImage,
        storageKey: String,
    ): ObjectNode = objectMapper.createObjectNode().apply {
        put("title", title)
        put("sourcePrompt", iconPrompt)
        put("prompt", generated.prompt)
        put("model", generated.model)
        put("mimeType", generated.mimeType)
        put("storageKey", storageKey)
        put("byteSize", generated.bytes.size)
        generated.revisedPrompt?.let { put("revisedPrompt", it) }
    }
}
