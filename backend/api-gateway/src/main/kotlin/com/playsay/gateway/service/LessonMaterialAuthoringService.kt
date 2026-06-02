package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.LessonMaterialDraftResponse
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialAiDraftRequest
import com.playsay.gateway.dto.MaterialAnswerSuggestionItem
import com.playsay.gateway.dto.MaterialAnswerSuggestionsRequest
import com.playsay.gateway.dto.MaterialAnswerSuggestionsResponse
import com.playsay.gateway.dto.MaterialGenerateImagesRequest
import com.playsay.gateway.dto.MaterialUrlImportRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

private const val materialUrlImportPromptLimit = 8_000
private const val materialUrlImportPromptTextLimit = 6_000

@Component
class LessonMaterialAuthoringService(
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val materialAiDraftService: MaterialAiDraftService,
    private val materialAnswerSuggestionService: MaterialAnswerSuggestionService,
    private val materialImageGenerationService: MaterialImageGenerationService,
    private val materialUrlImportService: MaterialUrlImportService,
    private val messageProvider: MessageProvider,
    private val materialRequestValidator: MaterialRequestValidator,
    private val lessonMaterialResponseMapper: LessonMaterialResponseMapper,
    private val materialAssetService: MaterialAssetService,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun draft(request: MaterialAiDraftRequest): LessonMaterialDraftResponse {
        val prompt = materialRequestValidator.requiredClean(request.prompt, "prompt", 4_000)
        val language = materialRequestValidator.requiredClean(request.language, "language", 16)
        val cefrLevel = materialRequestValidator.supportedCefrLevel(request.cefrLevel)
            ?: materialRequestValidator.inferCefrLevel(prompt)
        val title = materialRequestValidator.optionalClean(request.title, "title", 160)
            ?: prompt.lineSequence().firstOrNull()?.take(90)?.ifBlank { null }
            ?: messageProvider[MetaData.Messages.MATERIAL_NEW_TITLE]
        val sourceImageDataUrl = materialRequestValidator.validatedImageDataUrl(request.sourceImageDataUrl, "sourceImageDataUrl")
        val sourceFileName = materialRequestValidator.optionalClean(request.sourceFileName, "sourceFileName", 160)
        return materialAiDraftService.draft(
            MaterialAiDraftInput(
                title = title,
                prompt = prompt,
                language = language,
                cefrLevel = cefrLevel,
                sourceImageDataUrl = sourceImageDataUrl,
                sourceFileName = sourceFileName,
            ),
        )
    }

    fun draftFromUrl(request: MaterialUrlImportRequest): LessonMaterialDraftResponse {
        val url = materialRequestValidator.requiredClean(request.url, "url", 2_000)
        val language = materialRequestValidator.requiredClean(request.language, "language", 16)
        val imported = materialUrlImportService.fetch(url)
        val importPrompt = materialRequestValidator.optionalClean(request.prompt, "prompt", 2_000)
            ?: messageProvider[MetaData.Messages.MATERIAL_IMPORT_URL_PROMPT]
        val cefrLevel = materialRequestValidator.supportedCefrLevel(request.cefrLevel)
            ?: materialRequestValidator.inferCefrLevel(importPrompt + "\n" + imported.text.take(500))
        val title = materialRequestValidator.optionalClean(request.title, "title", 160)
            ?: imported.title?.take(120)?.ifBlank { null }
            ?: messageProvider[MetaData.Messages.MATERIAL_FROM_URL_TITLE]
        val prompt = buildString {
            appendLine(importPrompt)
            appendLine()
            appendLine("External source URL: ${imported.finalUrl}")
            imported.title?.let { pageTitle -> appendLine("Page title: $pageTitle") }
            imported.description?.let { description -> appendLine("Page description: $description") }
            appendLine()
            appendLine("Readable source text:")
            appendLine(imported.text.take(materialUrlImportPromptTextLimit))
        }.take(materialUrlImportPromptLimit)

        return materialAiDraftService.draft(
            MaterialAiDraftInput(
                title = title,
                prompt = prompt,
                language = language,
                cefrLevel = cefrLevel,
                sourceType = "external_url",
                sourceUrl = imported.finalUrl,
                sourceTitle = imported.title,
                sourceFetchedChars = imported.text.length,
            ),
        )
    }

    @Transactional
    fun generateImages(material: LessonMaterialRow, request: MaterialGenerateImagesRequest): LessonMaterialResponse {
        val blockId = materialRequestValidator.optionalClean(request.blockId, "blockId", 80)
        val maxImages = (request.maxImages ?: 12).coerceIn(1, 12)
        val document = objectMapper.readTree(material.document).deepCopy<ObjectNode>()
        val regenerate = request.regenerate == true
        val existingAssets = materialAssetService.findAssets(material.id).associateBy { asset -> asset.id }
        val targets = materialImageTargets(document, blockId, maxImages, regenerate, existingAssets, objectMapper, messageProvider)
        if (targets.isEmpty()) {
            return lessonMaterialResponseMapper.toResponse(material)
        }

        val replacedAssetIds = mutableListOf<UUID>()
        targets.forEach { target ->
            val generated = materialImageGenerationService.generate(
                MaterialImageGenerationInput(
                    prompt = target.imagePrompt,
                    alt = target.imageAlt,
                ),
            )
            val assetId = materialAssetService.upsertGeneratedImageAsset(material.id, target, generated)
            if (target.previousAssetId != null && target.previousAssetId != assetId) {
                replacedAssetIds.add(target.previousAssetId)
            }
            target.node.put(target.imageUrlField, "material-asset:$assetId")
            target.node.put("imageAlt", target.imageAlt)
        }

        val entity = lessonMaterialRepo.findById(material.id).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        entity.document = objectMapper.writeValueAsString(document)
        entity.updatedAt = Instant.now()
        lessonMaterialRepo.save(entity)

        materialAssetService.cleanupReplacedGeneratedAssets(material.id, replacedAssetIds.distinct())

        return lessonMaterialResponseMapper.toResponse(
            lessonMaterialRepo.findRowById(material.id)
                ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND),
        )
    }

    @Transactional(readOnly = true)
    fun suggestAcceptedAnswers(
        material: LessonMaterialRow,
        request: MaterialAnswerSuggestionsRequest,
    ): MaterialAnswerSuggestionsResponse {
        val blockId = materialRequestValidator.requiredClean(request.blockId, "blockId", 80)
        val requestedItemIds = request.itemIds
            .mapNotNull { itemId -> materialRequestValidator.optionalClean(itemId, "itemIds", 120) }
            .toSet()
        val document: JsonNode = objectMapper.readTree(material.document)
        val block = findMaterialBlock(document, blockId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val itemContexts = materialAnswerItemContexts(block)
            .takeIf { items -> items.isNotEmpty() }
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.MATERIAL_ANSWER_ITEMS_NOT_FOUND)
        val suggestions = itemContexts.mapNotNull { item ->
            if (requestedItemIds.isNotEmpty() && item.itemId !in requestedItemIds) {
                return@mapNotNull null
            }
            MaterialAnswerSuggestionItem(
                itemId = item.itemId,
                prompt = item.prompt,
                answer = item.answer,
                suggestions = materialAnswerSuggestionService.suggest(
                    MaterialAnswerSuggestionInput(
                        materialTitle = material.title,
                        language = material.language,
                        cefrLevel = material.cefrLevel,
                        blockTitle = block.get("title")?.asText()?.trim().orEmpty(),
                        blockType = block.get("type")?.asText()?.trim().orEmpty(),
                        itemId = item.itemId,
                        prompt = item.prompt,
                        itemContextPrompt = item.itemContextPrompt,
                        blockContextPrompt = item.blockContextPrompt,
                        answer = item.answer,
                        acceptedAnswers = item.acceptedAnswers,
                        options = item.options,
                        hintPrefix = item.hintPrefix,
                    ),
                ),
            )
        }

        return MaterialAnswerSuggestionsResponse(
            materialId = material.id,
            blockId = blockId,
            items = suggestions,
        )
    }
}
