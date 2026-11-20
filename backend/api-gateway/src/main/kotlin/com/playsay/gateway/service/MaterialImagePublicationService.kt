package com.playsay.gateway.service

import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialGenerateImagesRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

internal data class PreparedMaterialImage(val storageKey: String, val byteSize: Int, val metadata: GeneratedMaterialImage)

private data class ImageSelection(val target: MaterialImageTarget, val sourceKey: String?, val layout: String?) {
    val identity = Triple(target.blockId, target.targetType, target.targetId)

    fun matches(other: ImageSelection): Boolean =
        identity == other.identity && layout == other.layout && sourceKey == other.sourceKey &&
            target.copy(node = other.target.node) == other.target &&
            target.node.path(target.imageUrlField) == other.target.node.path(other.target.imageUrlField)
}

@Service
class MaterialImagePublicationService(
    private val catalog: LessonMaterialCatalogService,
    private val materials: LessonMaterialRepo,
    private val assets: MaterialAssetService,
    private val generator: MaterialImageGenerationService,
    private val objects: GeneratedImageObjects,
    private val validator: MaterialRequestValidator,
    private val messages: MessageProvider,
    transactionManager: PlatformTransactionManager,
) {
    private val tx = TransactionTemplate(transactionManager)
    private val mapper = jacksonObjectMapper()

    fun generate(actor: JwtAuthenticationToken, materialId: UUID, request: MaterialGenerateImagesRequest): LessonMaterialResponse {
        val limit = (request.maxImages ?: 12).coerceIn(1, 12)
        val blockId = validator.optionalClean(request.blockId, "blockId", 80)
        val (material, initial) = requireNotNull(tx.execute {
            val row = editable(actor, materialId)
            val selections = selections(row, mapper.readTree(row.document) as ObjectNode, blockId, request.regenerate == true)
            val initial = selections.take(limit)
            val identities = selections.groupingBy { it.identity }.eachCount()
            val assetIds = initial.mapNotNull { it.target.previousAssetId }
            if (initial.any { identities[it.identity] != 1 } || assetIds.distinct().size != assetIds.size) conflict()
            row to initial
        })
        if (initial.isEmpty()) return catalog.toResponse(material)
        val prepared = initial.map { selection ->
            val generated = generator.generate(MaterialImageGenerationInput(selection.target.imagePrompt, selection.target.imageAlt))
            objects.prepare(materialId, generated)
        }
        return requireNotNull(tx.execute {
            val entity = materials.lockById(materialId)
                ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
            val row = editable(actor, materialId)
            val document = mapper.readTree(row.document) as ObjectNode
            val current = selections(row, document, blockId, request.regenerate == true).groupBy { it.identity }
            val matched = initial.map { selected ->
                current[selected.identity]?.singleOrNull()?.takeIf(selected::matches) ?: conflict()
            }
            matched.forEachIndexed { index, selection ->
                val image = prepared[index]
                objects.publish(materialId, image.storageKey, selection.sourceKey)
                val assetId = assets.publishGeneratedImage(materialId, selection.target, image)
                selection.target.node.put(selection.target.imageUrlField, "material-asset:$assetId")
                selection.target.node.put("imageAlt", selection.target.imageAlt)
            }
            entity.document = document.toString()
            entity.updatedAt = Instant.now()
            materials.saveAndFlush(entity)
            catalog.toResponse(requireNotNull(materials.findRowById(materialId)))
        })
    }

    private fun editable(actor: JwtAuthenticationToken, materialId: UUID) =
        catalog.requireEditable(actor, materialId, MetaData.ErrorCodes.MATERIAL_IMAGES_FORBIDDEN)

    private fun selections(row: LessonMaterialRow, document: ObjectNode, blockId: String?, regenerate: Boolean): List<ImageSelection> {
        val existing = assets.findAssets(row.id).associateBy { it.id }
        val targets = materialImageTargets(document, blockId, Int.MAX_VALUE, regenerate, existing, mapper, messages)
        // Legacy positional IDs are only safe while the containing structure has the same order.
        val legacyLayout by lazy {
            document.path("pages").map { page -> page.path("blocks").map { block ->
                listOf(block.path("id"), block.path("type"), block.path("pairs").map { pair ->
                    listOf(pair.path("id"), pair.path("left"), pair.path("right"), pair.path("imagePrompt"))
                })
            } }.toString()
        }
        return targets.map { target ->
            ImageSelection(target, existing[target.previousAssetId]?.storageKey, if (target.positional) legacyLayout else null)
        }
    }

    private fun conflict(): Nothing =
        throw ProjectResponseException.localized(HttpStatus.CONFLICT, MetaData.ErrorCodes.MATERIAL_IMAGE_TARGET_CHANGED)
}
