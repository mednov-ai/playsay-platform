package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.utils.MetaData
import java.util.UUID

internal data class MaterialImageTarget(
    val targetType: String,
    val blockId: String,
    val targetId: String,
    val title: String,
    val left: String?,
    val right: String?,
    val imagePrompt: String,
    val imageAlt: String,
    val imageUrlField: String,
    val node: ObjectNode,
    val previousAssetId: UUID?,
)

internal fun materialImageTargets(
    document: ObjectNode,
    blockId: String?,
    maxImages: Int,
    regenerate: Boolean,
    existingAssets: Map<UUID, MaterialAssetEntity>,
    objectMapper: ObjectMapper,
    messageProvider: MessageProvider,
): List<MaterialImageTarget> {
    val pages = document.get("pages") as? ArrayNode ?: return emptyList()
    val targets = mutableListOf<MaterialImageTarget>()
    pages.forEach { page ->
        val blocks = page.get("blocks") as? ArrayNode ?: return@forEach
        blocks.forEach { block ->
            val blockObject = block as? ObjectNode ?: return@forEach
            val blockType = blockObject.get("type")?.asText()?.trim().orEmpty()
            val currentBlockId = blockObject.get("id")?.asText()?.takeIf { value -> value.isNotBlank() } ?: blockType.ifBlank { "block" }
            if (blockId != null && currentBlockId != blockId) {
                return@forEach
            }

            when (blockType) {
                "generatedImage" -> {
                    if (targets.size >= maxImages) {
                        return@forEach
                    }
                    val imageUrl = blockObject.get("url")?.asText()?.trim().orEmpty()
                    val imagePrompt = blockObject.get("prompt")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                        ?: return@forEach
                    val title = blockObject.get("title")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                        ?: messageProvider[MetaData.Messages.MATERIAL_AI_IMAGE_ALT]
                    val imageAlt = blockObject.get("caption")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                        ?: title
                    val decision = materialImageTargetDecision(
                        imageUrl = imageUrl,
                        imagePrompt = imagePrompt,
                        regenerate = regenerate,
                        existingAssets = existingAssets,
                        objectMapper = objectMapper,
                    ) ?: return@forEach
                    targets.add(
                        MaterialImageTarget(
                            targetType = "generatedImage",
                            blockId = currentBlockId,
                            targetId = currentBlockId,
                            title = title,
                            left = null,
                            right = null,
                            imagePrompt = imagePrompt,
                            imageAlt = imageAlt,
                            imageUrlField = "url",
                            node = blockObject,
                            previousAssetId = decision.previousAssetId,
                        ),
                    )
                }
                "matchingPairs" -> {
                    val pairs = blockObject.get("pairs") as? ArrayNode ?: return@forEach
                    pairs.forEach { pair ->
                        if (targets.size >= maxImages) {
                            return@forEach
                        }
                        val pairObject = pair as? ObjectNode ?: return@forEach
                        val imageUrl = pairObject.get("imageUrl")?.asText()?.trim().orEmpty()
                        val left = pairObject.get("left")?.asText()?.trim().orEmpty()
                        val right = pairObject.get("right")?.asText()?.trim().orEmpty()
                        if (left.isEmpty() || right.isEmpty()) {
                            return@forEach
                        }
                        val imagePromptValue = pairObject.get("imagePrompt")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                        val imageAltValue = pairObject.get("imageAlt")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                        val targetKind = pairObject.get("targetKind")?.asText()?.trim()?.uppercase().orEmpty()
                        val isImageTarget = targetKind == "IMAGE" ||
                            (targetKind.isEmpty() && (imagePromptValue != null || imageAltValue != null || imageUrl.isNotEmpty()))
                        if (!isImageTarget) {
                            return@forEach
                        }
                        val pairId = pairObject.get("id")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                            ?: "pair-${targets.size + 1}"
                        val imageAlt = imageAltValue ?: right
                        val imagePrompt = imagePromptValue ?: return@forEach
                        val decision = materialImageTargetDecision(
                            imageUrl = imageUrl,
                            imagePrompt = imagePrompt,
                            regenerate = regenerate,
                            existingAssets = existingAssets,
                            objectMapper = objectMapper,
                        ) ?: return@forEach
                        targets.add(
                            MaterialImageTarget(
                                targetType = "matchingPair",
                                blockId = currentBlockId,
                                targetId = pairId,
                                title = right,
                                left = left,
                                right = right,
                                imagePrompt = imagePrompt,
                                imageAlt = imageAlt,
                                imageUrlField = "imageUrl",
                                node = pairObject,
                                previousAssetId = decision.previousAssetId,
                            ),
                        )
                    }
                }
                else -> Unit
            }
        }
    }
    return targets
}

private data class MaterialImageTargetDecision(
    val previousAssetId: UUID?,
)

private fun materialImageTargetDecision(
    imageUrl: String,
    imagePrompt: String,
    regenerate: Boolean,
    existingAssets: Map<UUID, MaterialAssetEntity>,
    objectMapper: ObjectMapper,
): MaterialImageTargetDecision? {
    if (imageUrl.isBlank()) {
        return MaterialImageTargetDecision(previousAssetId = null)
    }

    val assetId = materialAssetIdFromReference(imageUrl)
    if (regenerate) {
        return MaterialImageTargetDecision(previousAssetId = assetId)
    }

    if (assetId == null) {
        return null
    }

    val asset = existingAssets[assetId] ?: return MaterialImageTargetDecision(previousAssetId = assetId)
    if (asset.kind != "GENERATED_IMAGE") {
        return null
    }
    if (materialGeneratedImageAssetMatches(asset, imagePrompt, objectMapper)) {
        return null
    }
    return MaterialImageTargetDecision(previousAssetId = assetId)
}

private fun materialGeneratedImageAssetMatches(
    asset: MaterialAssetEntity,
    imagePrompt: String,
    objectMapper: ObjectMapper,
): Boolean {
    val metadata = runCatching { objectMapper.readTree(asset.metadata) }.getOrNull() ?: return false
    val storedPrompt = metadata.get("sourcePrompt")?.takeIf { node -> node.isTextual }?.asText()
        ?: metadata.get("prompt")?.takeIf { node -> node.isTextual }?.asText()?.substringBefore("\n\nCreate a new original illustration")
    return normalizeMaterialImageSource(storedPrompt) == normalizeMaterialImageSource(imagePrompt)
}

private fun normalizeMaterialImageSource(value: String?): String =
    value.orEmpty().trim().replace(Regex("""\s+"""), " ").lowercase()

private fun materialAssetIdFromReference(value: String?): UUID? {
    val marker = "material-asset:"
    val clean = value?.trim().orEmpty()
    if (!clean.startsWith(marker)) {
        return null
    }
    return runCatching { UUID.fromString(clean.removePrefix(marker).trim()) }.getOrNull()
}
