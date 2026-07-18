package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.databind.node.TextNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.LiveLessonImagePageResponse
import com.playsay.gateway.dto.LiveLessonHtmlGamePageResponse
import com.playsay.gateway.dto.MaterialImagePageResponse
import com.playsay.gateway.dto.MaterialHtmlGameEnrichmentRequest
import com.playsay.gateway.dto.MaterialAnnotationRequest
import com.playsay.gateway.entity.LessonMaterialEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.mapper.LessonMaterialResponseMapper
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile

@Component
class MaterialImagePageService(
    private val lessonRepo: LessonRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val lessonMaterialCatalogService: LessonMaterialCatalogService,
    private val scheduledLessonStore: ScheduledLessonStore,
    private val materialAssetService: MaterialAssetService,
    private val materialAssetUploadService: MaterialAssetUploadService,
    private val materialHtmlGameEnrichmentService: MaterialHtmlGameEnrichmentService,
    private val materialHtmlGameMetadataService: MaterialHtmlGameMetadataService,
    private val materialAnnotationService: MaterialAnnotationService,
    private val lessonMaterialResponseMapper: LessonMaterialResponseMapper,
    private val messageProvider: MessageProvider,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    @Transactional
    fun appendReusableImagePage(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        file: MultipartFile,
        title: String?,
    ): MaterialImagePageResponse {
        lessonMaterialCatalogService.requireEditable(
            authentication,
            materialId,
            MetaData.ErrorCodes.MATERIAL_EDIT_FORBIDDEN,
        )
        val material = lessonMaterialRepo.findById(materialId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val activePageId = appendImagePage(material, materialAssetUploadService.validateImageFile(file), title)
        return MaterialImagePageResponse(
            material = lessonMaterialResponseMapper.toResponse(requireMaterialRow(material.id)),
            activePageId = activePageId,
        )
    }

    @Transactional
    fun appendLiveLessonImagePage(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        file: MultipartFile,
        title: String?,
    ): LiveLessonImagePageResponse {
        lessonMaterialCatalogService.requireMaterialManager(authentication)
        requireSupportedLiveLesson(lessonId, MetaData.ErrorCodes.MATERIAL_IMAGE_PAGE_PARALLEL_UNSUPPORTED)
        val upload = materialAssetUploadService.validateImageFile(file)
        val targetMaterial = targetLiveLessonMaterial(
            authentication = authentication,
            lessonId = lessonId,
            originalFileName = upload.originalFileName,
            title = title,
            fallbackTitle = messageProvider[MetaData.Messages.MATERIAL_STATIC_IMAGE_PAGE_TITLE],
        )

        val activePageId = appendImagePage(targetMaterial, upload, title)
        saveActiveLessonPage(lessonId, targetMaterial.id, activePageId)
        val updatedLesson = scheduledLessonStore.assignSharedMaterial(authentication, lessonId, targetMaterial.id)
        return LiveLessonImagePageResponse(
            lesson = updatedLesson,
            material = lessonMaterialResponseMapper.toResponse(requireMaterialRow(targetMaterial.id)),
            activePageId = activePageId,
        )
    }

    @Transactional
    fun appendLiveLessonHtmlGamePage(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        file: MultipartFile,
    ): LiveLessonHtmlGamePageResponse {
        lessonMaterialCatalogService.requireMaterialManager(authentication)
        requireSupportedLiveLesson(lessonId, MetaData.ErrorCodes.MATERIAL_HTML_GAME_PARALLEL_UNSUPPORTED)
        val upload = materialAssetUploadService.validateHtmlGameFile(file)
        val targetMaterial = targetLiveLessonMaterial(
            authentication = authentication,
            lessonId = lessonId,
            originalFileName = upload.originalFileName,
            title = null,
            fallbackTitle = messageProvider[MetaData.Messages.MATERIAL_HTML_GAME_PAGE_TITLE],
        )
        val appendedGame = appendHtmlGamePage(targetMaterial, upload)
        val activePageId = appendedGame.pageId
        materialHtmlGameEnrichmentService.request(
            targetMaterial.id,
            appendedGame.assetId,
            MaterialHtmlGameEnrichmentRequest(blockId = appendedGame.blockId),
        )
        saveActiveLessonPage(lessonId, targetMaterial.id, activePageId)
        val updatedLesson = scheduledLessonStore.assignSharedMaterial(authentication, lessonId, targetMaterial.id)
        return LiveLessonHtmlGamePageResponse(
            lesson = updatedLesson,
            material = lessonMaterialResponseMapper.toResponse(requireMaterialRow(targetMaterial.id)),
            activePageId = activePageId,
        )
    }

    private fun createLiveLessonMaterialCopy(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        source: LessonMaterialEntity,
    ): LessonMaterialEntity {
        val targetId = UUID.randomUUID()
        val now = Instant.now()
        val target = lessonMaterialRepo.saveAndFlush(
            LessonMaterialEntity(
                id = targetId,
                ownerTeacherUserId = lessonMaterialCatalogService.currentUserId(authentication),
                title = source.title,
                description = source.description,
                language = source.language,
                cefrLevel = source.cefrLevel,
                visibility = MetaData.MaterialVisibility.PRIVATE,
                status = source.status,
                document = source.document,
                sourceMeta = objectMapper.writeValueAsString(liveLessonCopyMeta(lessonId, source)),
                scoringRubric = source.scoringRubric,
                topicTags = source.topicTags,
                skillTags = source.skillTags,
                ageBand = source.ageBand,
                estimatedDurationMin = source.estimatedDurationMin,
                createdAt = now,
                updatedAt = now,
            ),
        )

        val document = readMaterialDocument(target)
        val assetReferenceMap = materialAssetService.copyAssets(
            sourceMaterialId = source.id,
            targetMaterialId = target.id,
            assetIds = collectMaterialAssetReferences(document),
        )
        if (assetReferenceMap.isNotEmpty()) {
            target.document = objectMapper.writeValueAsString(remapMaterialAssetReferences(document, assetReferenceMap))
            target.updatedAt = Instant.now()
            lessonMaterialRepo.saveAndFlush(target)
        }

        return target
    }

    private fun targetLiveLessonMaterial(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        originalFileName: String?,
        title: String?,
        fallbackTitle: String,
    ): LessonMaterialEntity {
        val currentMaterialId = lessonRepo.findScheduledMaterialLookup(lessonId)?.materialId
        if (currentMaterialId == null) {
            return createEmptyLiveLessonMaterial(authentication, lessonId, originalFileName, title, fallbackTitle)
        }
        val currentMaterial = lessonMaterialRepo.findById(currentMaterialId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        return if (currentMaterial.isLiveLessonCopyFor(lessonId)) {
            currentMaterial
        } else {
            createLiveLessonMaterialCopy(authentication, lessonId, currentMaterial)
        }
    }

    private fun createEmptyLiveLessonMaterial(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        originalFileName: String?,
        title: String?,
        fallbackTitle: String,
    ): LessonMaterialEntity {
        val now = Instant.now()
        return lessonMaterialRepo.saveAndFlush(
            LessonMaterialEntity(
                id = UUID.randomUUID(),
                ownerTeacherUserId = lessonMaterialCatalogService.currentUserId(authentication),
                title = cleanPageTitle(title, originalFileName, fallbackTitle),
                description = null,
                language = "en",
                cefrLevel = "A2",
                visibility = MetaData.MaterialVisibility.PRIVATE,
                status = MetaData.MaterialStatuses.PUBLISHED,
                document = objectMapper.writeValueAsString(
                    objectMapper.createObjectNode().apply {
                        put("schemaVersion", 1)
                        putArray("pages")
                    },
                ),
                sourceMeta = objectMapper.writeValueAsString(liveLessonCopyMeta(lessonId, source = null)),
                scoringRubric = objectMapper.writeValueAsString(
                    objectMapper.createObjectNode().apply {
                        put("maxScore", 10)
                    },
                ),
                topicTags = "[]",
                skillTags = "[]",
                ageBand = null,
                estimatedDurationMin = null,
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    private fun appendImagePage(material: LessonMaterialEntity, upload: ValidatedMaterialAssetFile, title: String?): String {
        val document = readMaterialDocument(material)
        val pages = materialPages(document)
        val pageId = "page-${UUID.randomUUID()}"
        val pageTitle = cleanPageTitle(
            title,
            upload.originalFileName,
            messageProvider[MetaData.Messages.MATERIAL_STATIC_IMAGE_PAGE_TITLE],
        )
        val assetId = materialAssetUploadService.insertUploadedImageAsset(
            materialId = material.id,
            originalFileName = upload.originalFileName,
            contentType = upload.contentType,
            bytes = upload.bytes,
        )
        pages.add(staticImagePage(pageId, pageTitle, assetId))

        material.document = objectMapper.writeValueAsString(document)
        material.updatedAt = Instant.now()
        lessonMaterialRepo.saveAndFlush(material)
        return pageId
    }

    private fun appendHtmlGamePage(material: LessonMaterialEntity, upload: ValidatedMaterialAssetFile): AppendedHtmlGame {
        val document = readMaterialDocument(material)
        val pages = materialPages(document)
        val pageId = "page-${UUID.randomUUID()}"
        val gameMetadata = materialHtmlGameMetadataService.extract(upload.bytes, upload.originalFileName)
        val pageTitle = gameMetadata.displayTitle
        val assetId = materialAssetUploadService.insertHtmlGameAsset(
            materialId = material.id,
            originalFileName = upload.originalFileName,
            bytes = upload.bytes,
        )
        pages.add(htmlGamePage(pageId, pageTitle, gameMetadata.titleSource, assetId))
        material.document = objectMapper.writeValueAsString(document)
        material.updatedAt = Instant.now()
        lessonMaterialRepo.saveAndFlush(material)
        return AppendedHtmlGame(pageId = pageId, blockId = "block-$pageId", assetId = assetId)
    }

    private fun staticImagePage(pageId: String, title: String, assetId: UUID): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("id", pageId)
            put("title", title)
            put("layout", "STATIC_IMAGE")
            putArray("blocks").add(
                objectMapper.createObjectNode().apply {
                    put("id", "block-$pageId")
                    put("type", "image")
                    put("title", title)
                    put("url", "material-asset:$assetId")
                    put("alt", title)
                    put("caption", "")
                    put("objectFit", "contain")
                    put("imageSize", "FULL")
                },
            )
        }

    private fun htmlGamePage(pageId: String, title: String, titleSource: String, assetId: UUID): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("id", pageId)
            put("title", title)
            put("layout", "HTML_GAME")
            putArray("blocks").add(
                objectMapper.createObjectNode().apply {
                    put("id", "block-$pageId")
                    put("type", "htmlGame")
                    put("title", title)
                    put("gameTitleSource", titleSource)
                    put("url", "material-asset:$assetId")
                    put("height", 640)
                },
            )
        }

    private data class AppendedHtmlGame(val pageId: String, val blockId: String, val assetId: UUID)

    private fun readMaterialDocument(material: LessonMaterialEntity): ObjectNode =
        runCatching { objectMapper.readTree(material.document).deepCopy<ObjectNode>() }
            .getOrElse {
                objectMapper.createObjectNode().apply {
                    put("schemaVersion", 1)
                    putArray("pages")
                }
            }

    private fun materialPages(document: ObjectNode): ArrayNode =
        (document.get("pages") as? ArrayNode) ?: document.putArray("pages")

    private fun cleanPageTitle(title: String?, originalFileName: String?, fallbackTitle: String): String =
        title?.trim()?.takeIf { value -> value.isNotEmpty() }?.take(160)
            ?: originalFileName
                ?.substringBeforeLast('.', missingDelimiterValue = originalFileName)
                ?.trim()
                ?.takeIf { value -> value.isNotEmpty() }
                ?.take(160)
            ?: fallbackTitle

    private fun requireSupportedLiveLesson(lessonId: UUID, parallelErrorCode: String) {
        val lesson = lessonRepo.lockById(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        if (lesson.workMode == MetaData.LessonWorkModes.PARALLEL) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, parallelErrorCode)
        }
    }

    private fun liveLessonCopyMeta(lessonId: UUID, source: LessonMaterialEntity?): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("kind", "LIVE_LESSON_COPY")
            put("sourceLessonId", lessonId.toString())
            if (source != null) {
                put("sourceMaterialId", source.id.toString())
                set<JsonNode>(
                    "sourceMeta",
                    runCatching { objectMapper.readTree(source.sourceMeta) }.getOrElse { objectMapper.createObjectNode() },
                )
            }
        }

    private fun LessonMaterialEntity.isLiveLessonCopyFor(lessonId: UUID): Boolean {
        val meta = runCatching { objectMapper.readTree(sourceMeta) }.getOrNull() ?: return false
        return meta.path("kind").asText() == "LIVE_LESSON_COPY" &&
            meta.path("sourceLessonId").asText() == lessonId.toString()
    }

    private fun collectMaterialAssetReferences(node: JsonNode): Set<UUID> =
        buildSet {
            collectMaterialAssetReferences(node, this)
        }

    private fun collectMaterialAssetReferences(node: JsonNode, refs: MutableSet<UUID>) {
        when {
            node.isTextual -> materialAssetIdFromReference(node.asText())?.let(refs::add)
            node.isObject -> node.fieldNames().forEachRemaining { fieldName ->
                collectMaterialAssetReferences(node.get(fieldName), refs)
            }
            node.isArray -> node.elements().forEachRemaining { item -> collectMaterialAssetReferences(item, refs) }
        }
    }

    private fun remapMaterialAssetReferences(node: JsonNode, refs: Map<UUID, UUID>): JsonNode =
        when {
            node.isTextual -> {
                val replacement = materialAssetIdFromReference(node.asText())?.let(refs::get)
                if (replacement == null) node.deepCopy() else TextNode("material-asset:$replacement")
            }
            node.isObject -> objectMapper.createObjectNode().also { copy ->
                node.fieldNames().forEachRemaining { fieldName ->
                    copy.set<JsonNode>(fieldName, remapMaterialAssetReferences(node.get(fieldName), refs))
                }
            }
            node.isArray -> objectMapper.createArrayNode().also { copy ->
                node.elements().forEachRemaining { item -> copy.add(remapMaterialAssetReferences(item, refs)) }
            }
            else -> node.deepCopy()
        }

    private fun materialAssetIdFromReference(value: String): UUID? =
        value.trim()
            .takeIf { reference -> reference.startsWith(materialAssetReferencePrefix) }
            ?.removePrefix(materialAssetReferencePrefix)
            ?.let { raw -> runCatching { UUID.fromString(raw) }.getOrNull() }

    private fun saveActiveLessonPage(lessonId: UUID, materialId: UUID, activePageId: String) {
        val current = materialAnnotationService.getOrCreate(lessonId, materialId)
        val content = runCatching { current.content.deepCopy<ObjectNode>() }
            .getOrElse { objectMapper.createObjectNode() }
            .apply {
                put("schemaVersion", 2)
                put("coordinateSpace", "material-page")
                put("activePageId", activePageId)
                if (get("strokes") !is ArrayNode) {
                    set<ArrayNode>("strokes", objectMapper.createArrayNode())
                }
            }
        materialAnnotationService.save(lessonId, materialId, MaterialAnnotationRequest(content))
    }

    private fun requireMaterialRow(materialId: UUID) =
        lessonMaterialRepo.findRowById(materialId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
}

private const val materialAssetReferencePrefix = "material-asset:"
