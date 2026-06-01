package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.LessonMaterialDraftResponse
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialAiDraftRequest
import com.playsay.gateway.dto.MaterialAnnotationRequest
import com.playsay.gateway.dto.MaterialAnnotationResponse
import com.playsay.gateway.dto.MaterialAnswerSuggestionItem
import com.playsay.gateway.dto.MaterialAnswerSuggestionsRequest
import com.playsay.gateway.dto.MaterialAnswerSuggestionsResponse
import com.playsay.gateway.dto.MaterialAssetResponse
import com.playsay.gateway.dto.MaterialAssetUpdateRequest
import com.playsay.gateway.dto.MaterialGenerateImagesRequest
import com.playsay.gateway.dto.MaterialSubmissionRequest
import com.playsay.gateway.dto.MaterialSubmissionResponse
import com.playsay.gateway.dto.MaterialUrlImportRequest
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.LessonMaterialAnnotationEntity
import com.playsay.gateway.entity.LessonMaterialEntity
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.entity.SubmissionEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.LessonMaterialAnnotationRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.repo.MaterialSubmissionRow
import com.playsay.gateway.repo.ScheduledMaterialLookupRow
import com.playsay.gateway.repo.SubmissionRepo
import com.playsay.gateway.utils.MetaData
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

private typealias StoredLessonMaterial = LessonMaterialRow
private typealias StoredMaterialAsset = MaterialAssetEntity
private typealias StoredMaterialSubmission = MaterialSubmissionRow
private typealias StoredMaterialAnnotation = LessonMaterialAnnotationEntity
private typealias ScheduledMaterialLookup = ScheduledMaterialLookupRow

private const val fillGapDefaultMaxAttempts = 5
private const val fillGapDefaultMaxErrors = 3
private data class ValidatedLessonMaterialRequest(
    val title: String,
    val description: String?,
    val language: String,
    val cefrLevel: String,
    val visibility: String,
    val status: String,
    val document: JsonNode,
    val sourceMeta: JsonNode,
    val scoringRubric: JsonNode,
)

private const val materialAiSourceImageDataUrlMaxLength = 2_500_000
private const val materialUrlImportPromptLimit = 8_000
private const val materialUrlImportPromptTextLimit = 6_000
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
class LessonMaterialStore(
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val materialAssetRepo: MaterialAssetRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val assignmentRepo: AssignmentRepo,
    private val submissionRepo: SubmissionRepo,
    private val lessonMaterialAnnotationRepo: LessonMaterialAnnotationRepo,
    private val userProfileStore: UserProfileStore,
    private val materialAiDraftService: MaterialAiDraftService,
    private val materialAnswerSuggestionService: MaterialAnswerSuggestionService,
    private val materialImageGenerationService: MaterialImageGenerationService,
    private val materialUrlImportService: MaterialUrlImportService,
    private val materialScoringService: MaterialScoringService,
    private val materialObjectStorage: MaterialObjectStorage,
    private val messageProvider: MessageProvider,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    @Transactional
    fun list(authentication: JwtAuthenticationToken): List<LessonMaterialResponse> {
        val materials = when {
            authentication.isMaterialAdmin() -> {
                lessonMaterialRepo.findRowsForAdmin(MetaData.MaterialStatuses.ARCHIVED)
            }
            authentication.canManageMaterials() -> {
                lessonMaterialRepo.findRowsForTeacher(
                    ownerTeacherUserId = userProfileStore.currentUserId(authentication),
                    archivedStatus = MetaData.MaterialStatuses.ARCHIVED,
                    publicVisibility = MetaData.MaterialVisibility.PUBLIC,
                    publishedStatus = MetaData.MaterialStatuses.PUBLISHED,
                )
            }
            else -> {
                lessonMaterialRepo.findPublicPublishedRows(
                    publicVisibility = MetaData.MaterialVisibility.PUBLIC,
                    publishedStatus = MetaData.MaterialStatuses.PUBLISHED,
                )
            }
        }

        return materials
            .map { material -> material.toResponse(objectMapper) }
    }

    @Transactional
    fun get(authentication: JwtAuthenticationToken, materialId: UUID): LessonMaterialResponse {
        val currentUserId = authentication.currentUserIdIfNeeded()
        val material = find(materialId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        if (!material.canRead(authentication, currentUserId)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return material.toResponse(objectMapper)
    }

    @Transactional
    fun create(authentication: JwtAuthenticationToken, request: LessonMaterialRequest): LessonMaterialResponse {
        authentication.requireMaterialManager()
        val ownerTeacherUserId = userProfileStore.currentUserId(authentication)
        val values = request.validated(objectMapper, messageProvider)
        val now = Instant.now()

        val material = lessonMaterialRepo.save(
            LessonMaterialEntity(
                id = UUID.randomUUID(),
                ownerTeacherUserId = ownerTeacherUserId,
                title = values.title,
                description = values.description,
                language = values.language,
                cefrLevel = values.cefrLevel,
                visibility = values.visibility,
                status = values.status,
                document = objectMapper.writeValueAsString(values.document),
                sourceMeta = objectMapper.writeValueAsString(values.sourceMeta),
                scoringRubric = objectMapper.writeValueAsString(values.scoringRubric),
                createdAt = now,
                updatedAt = now,
            ),
        )

        return requireNotNull(find(material.id)).toResponse(objectMapper)
    }

    @Transactional
    fun update(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: LessonMaterialRequest,
    ): LessonMaterialResponse {
        val material = find(materialId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.MATERIAL_EDIT_FORBIDDEN)
        }

        val values = request.validated(objectMapper, messageProvider)
        val entity = lessonMaterialRepo.findById(materialId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        entity.title = values.title
        entity.description = values.description
        entity.language = values.language
        entity.cefrLevel = values.cefrLevel
        entity.visibility = values.visibility
        entity.status = values.status
        entity.document = objectMapper.writeValueAsString(values.document)
        entity.sourceMeta = objectMapper.writeValueAsString(values.sourceMeta)
        entity.scoringRubric = objectMapper.writeValueAsString(values.scoringRubric)
        entity.updatedAt = Instant.now()
        lessonMaterialRepo.save(entity)

        return requireNotNull(find(materialId)).toResponse(objectMapper)
    }

    @Transactional
    fun archive(authentication: JwtAuthenticationToken, materialId: UUID) {
        val material = find(materialId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.MATERIAL_ARCHIVE_FORBIDDEN)
        }

        val entity = lessonMaterialRepo.findById(materialId).orElse(null)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        entity.status = MetaData.MaterialStatuses.ARCHIVED
        entity.updatedAt = Instant.now()
        lessonMaterialRepo.save(entity)
    }

    @Transactional(readOnly = true)
    fun getForScheduledLesson(authentication: JwtAuthenticationToken, lessonId: UUID): LessonMaterialResponse {
        val lesson = scheduledMaterialLookup(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)

        if (!authentication.canManageMaterials() && !lesson.isVisibleToParticipant(Instant.now())) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        if (!authentication.canManageMaterials() && !isLessonParticipant(lessonId, authentication.token.subject)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        val materialId = lesson.materialId ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val material = find(materialId)?.takeIf { it.status != "ARCHIVED" }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        return material.toResponse(objectMapper)
    }

    @Transactional
    fun getSubmissionForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): MaterialSubmissionResponse {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val material = find(materialId)?.takeIf { it.status != "ARCHIVED" }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val userId = userProfileStore.currentUserId(authentication)
        val assignmentId = findOrCreateMaterialSubmissionAssignment(lessonId, material)
        val submission = findMaterialSubmission(assignmentId, lessonId, userId)
            ?: createEmptyMaterialSubmission(assignmentId, lessonId, materialId, userId)
        return submission.toResponse(objectMapper)
    }

    @Transactional(readOnly = true)
    fun listSubmissionsForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): List<MaterialSubmissionResponse> {
        authentication.requireMaterialManager()
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val assignmentId = findMaterialSubmissionAssignment(lessonId, materialId) ?: return emptyList()

        return submissionRepo.findMaterialSubmissionRows(assignmentId, lessonId)
            .map { submission -> submission.toResponse(objectMapper) }
    }

    @Transactional
    fun saveSubmissionForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: MaterialSubmissionRequest,
    ): MaterialSubmissionResponse {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val material = find(materialId)?.takeIf { it.status != "ARCHIVED" }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        validateJsonSize("content", request.content, objectMapper, 1_000_000)

        val userId = userProfileStore.currentUserId(authentication)
        val assignmentId = findOrCreateMaterialSubmissionAssignment(lessonId, material)
        val now = Instant.now()
        val scoring = materialScoringService.score(material.document, material.scoringRubric, request.content)
        val content = objectMapper.writeValueAsString(scoring?.content ?: request.content)
        val existing = findMaterialSubmission(assignmentId, lessonId, userId)

        val submissionId = if (existing == null) {
            submissionRepo.saveAndFlush(
                SubmissionEntity(
                    id = UUID.randomUUID(),
                    assignmentId = assignmentId,
                    studentUserId = userId,
                    lessonId = lessonId,
                    content = content,
                    score = scoring?.score,
                    errorsCount = scoring?.errorsCount,
                    submittedAt = if (request.submitted) now else null,
                    createdAt = now,
                    updatedAt = now,
                ),
            ).id
        } else {
            val entity = submissionRepo.findById(existing.id).orElseThrow()
            entity.content = content
            entity.score = scoring?.score
            entity.errorsCount = scoring?.errorsCount
            if (request.submitted) {
                entity.submittedAt = now
            }
            entity.updatedAt = now
            submissionRepo.save(entity)
            existing.id
        }

        return requireNotNull(findMaterialSubmission(submissionId)).toResponse(objectMapper)
    }

    @Transactional
    fun saveCollaborationSubmission(
        lessonId: UUID,
        materialId: UUID,
        studentUserId: UUID,
        yjsDocumentId: String,
        content: JsonNode,
        submitted: Boolean,
    ): MaterialSubmissionResponse {
        val material = find(materialId)?.takeIf { it.status != "ARCHIVED" }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        validateJsonSize("content", content, objectMapper, 1_000_000)

        val assignmentId = findOrCreateMaterialSubmissionAssignment(lessonId, material)
        val now = Instant.now()
        val scoring = materialScoringService.score(material.document, material.scoringRubric, content)
        val storedContent = objectMapper.writeValueAsString(scoring?.content ?: content)
        val existing = findMaterialSubmission(assignmentId, lessonId, studentUserId)

        val submissionId = if (existing == null) {
            submissionRepo.saveAndFlush(
                SubmissionEntity(
                    id = UUID.randomUUID(),
                    assignmentId = assignmentId,
                    studentUserId = studentUserId,
                    lessonId = lessonId,
                    yjsDocumentId = yjsDocumentId,
                    content = storedContent,
                    score = scoring?.score,
                    errorsCount = scoring?.errorsCount,
                    submittedAt = if (submitted) now else null,
                    createdAt = now,
                    updatedAt = now,
                ),
            ).id
        } else {
            val entity = submissionRepo.findById(existing.id).orElseThrow()
            entity.yjsDocumentId = yjsDocumentId
            entity.content = storedContent
            entity.score = scoring?.score
            entity.errorsCount = scoring?.errorsCount
            if (submitted) {
                entity.submittedAt = now
            }
            entity.updatedAt = now
            submissionRepo.save(entity)
            existing.id
        }

        return requireNotNull(findMaterialSubmission(submissionId)).toResponse(objectMapper)
    }

    @Transactional
    fun getAnnotationForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): MaterialAnnotationResponse {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        find(materialId)?.takeIf { it.status != "ARCHIVED" }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val annotation = findMaterialAnnotation(lessonId, materialId)
            ?: createEmptyMaterialAnnotation(lessonId, materialId)
        return annotation.toResponse(objectMapper)
    }

    @Transactional
    fun saveAnnotationForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: MaterialAnnotationRequest,
    ): MaterialAnnotationResponse {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        find(materialId)?.takeIf { it.status != "ARCHIVED" }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        validateJsonSize("content", request.content, objectMapper, 1_000_000)

        val existing = findMaterialAnnotation(lessonId, materialId)
        val now = Instant.now()
        val content = objectMapper.writeValueAsString(request.content)
        val annotationId = if (existing == null) {
            lessonMaterialAnnotationRepo.saveAndFlush(
                LessonMaterialAnnotationEntity(
                    id = UUID.randomUUID(),
                    lessonId = lessonId,
                    materialId = materialId,
                    content = content,
                    createdAt = now,
                    updatedAt = now,
                ),
            ).id
        } else {
            val entity = lessonMaterialAnnotationRepo.findById(existing.id).orElseThrow()
            entity.content = content
            entity.updatedAt = now
            lessonMaterialAnnotationRepo.save(entity)
            existing.id
        }

        return requireNotNull(findMaterialAnnotation(annotationId)).toResponse(objectMapper)
    }

    fun draft(authentication: JwtAuthenticationToken, request: MaterialAiDraftRequest): LessonMaterialDraftResponse {
        authentication.requireMaterialManager()
        val prompt = request.prompt.requiredClean("prompt", 4_000)
        val language = request.language.requiredClean("language", 16)
        val cefrLevel = request.cefrLevel?.trim()?.uppercase()?.takeIf { it in cefrLevels }
            ?: inferCefrLevel(prompt)
        val title = request.title.optionalClean("title", 160)
            ?: prompt.lineSequence().firstOrNull()?.take(90)?.ifBlank { null }
            ?: messageProvider[MetaData.Messages.MATERIAL_NEW_TITLE]
        val sourceImageDataUrl = request.sourceImageDataUrl.validatedImageDataUrl("sourceImageDataUrl")
        val sourceFileName = request.sourceFileName.optionalClean("sourceFileName", 160)
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

    fun draftFromUrl(authentication: JwtAuthenticationToken, request: MaterialUrlImportRequest): LessonMaterialDraftResponse {
        authentication.requireMaterialManager()
        val url = request.url.requiredClean("url", 2_000)
        val language = request.language.requiredClean("language", 16)
        val imported = materialUrlImportService.fetch(url)
        val importPrompt = request.prompt.optionalClean("prompt", 2_000)
            ?: messageProvider[MetaData.Messages.MATERIAL_IMPORT_URL_PROMPT]
        val cefrLevel = request.cefrLevel?.trim()?.uppercase()?.takeIf { it in cefrLevels }
            ?: inferCefrLevel(importPrompt + "\n" + imported.text.take(500))
        val title = request.title.optionalClean("title", 160)
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

    fun generateImages(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: MaterialGenerateImagesRequest,
    ): LessonMaterialResponse {
        val material = find(materialId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.MATERIAL_IMAGES_FORBIDDEN)
        }

        val blockId = request.blockId.optionalClean("blockId", 80)
        val maxImages = (request.maxImages ?: 12).coerceIn(1, 12)
        val document = objectMapper.readTree(material.document).deepCopy<ObjectNode>()
        val regenerate = request.regenerate == true
        val existingAssets = findAssets(materialId).associateBy { asset -> asset.id }
        val targets = materialImageTargets(document, blockId, maxImages, regenerate, existingAssets, objectMapper, messageProvider)
        if (targets.isEmpty()) {
            return material.toResponse(objectMapper)
        }

        val replacedAssetIds = mutableListOf<UUID>()
        targets.forEach { target ->
            val generated = materialImageGenerationService.generate(
                MaterialImageGenerationInput(
                    prompt = target.imagePrompt,
                    alt = target.imageAlt,
                ),
            )
            val assetId = upsertGeneratedImageAsset(materialId, target, generated)
            if (target.previousAssetId != null && target.previousAssetId != assetId) {
                replacedAssetIds.add(target.previousAssetId)
            }
            target.node.put(target.imageUrlField, "material-asset:$assetId")
            target.node.put("imageAlt", target.imageAlt)
        }

        val entity = lessonMaterialRepo.findById(materialId).orElseThrow()
        entity.document = objectMapper.writeValueAsString(document)
        entity.updatedAt = Instant.now()
        lessonMaterialRepo.save(entity)

        cleanupReplacedGeneratedAssets(materialId, replacedAssetIds.distinct())

        return requireNotNull(find(materialId)).toResponse(objectMapper)
    }

    @Transactional
    fun suggestAcceptedAnswers(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: MaterialAnswerSuggestionsRequest,
    ): MaterialAnswerSuggestionsResponse {
        val material = find(materialId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.MATERIAL_ANSWER_SUGGESTIONS_FORBIDDEN)
        }

        val blockId = request.blockId.requiredClean("blockId", 80)
        val requestedItemIds = request.itemIds
            .mapNotNull { itemId -> itemId.optionalClean("itemIds", 120) }
            .toSet()
        val document = objectMapper.readTree(material.document)
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
            materialId = materialId,
            blockId = blockId,
            items = suggestions,
        )
    }

    @Transactional
    fun listAssets(authentication: JwtAuthenticationToken, materialId: UUID): List<MaterialAssetResponse> {
        val material = find(materialId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val currentUserId = authentication.currentUserIdIfNeeded()
        val canRead = material.canRead(authentication, currentUserId) ||
            isActiveMaterialParticipant(materialId, authentication.token.subject, Instant.now())
        if (!canRead) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return materialAssetRepo.findByMaterialIdOrderByCreatedAtDesc(materialId)
            .map { asset -> asset.toResponse(objectMapper) }
    }

    @Transactional
    fun assetContent(authentication: JwtAuthenticationToken, materialId: UUID, assetId: UUID): ResponseEntity<ByteArray> {
        val material = find(materialId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val currentUserId = authentication.currentUserIdIfNeeded()
        val canRead = material.canRead(authentication, currentUserId) ||
            isActiveMaterialParticipant(materialId, authentication.token.subject, Instant.now())
        if (!canRead) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
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

    @Transactional
    fun updateAsset(authentication: JwtAuthenticationToken, materialId: UUID, assetId: UUID, request: MaterialAssetUpdateRequest): MaterialAssetResponse {
        val material = find(materialId) ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.MATERIAL_ASSET_EDIT_FORBIDDEN)
        }
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

    private fun upsertGeneratedImageAsset(
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

    private fun cleanupReplacedGeneratedAssets(materialId: UUID, assetIds: List<UUID>) {
        assetIds.forEach { assetId ->
            val asset = findAsset(assetId)?.takeIf { found -> found.materialId == materialId } ?: return@forEach
            asset.storageKey?.trim()?.takeIf { key -> key.isNotEmpty() }?.let { key ->
                runCatching { materialObjectStorage.deleteObject(key) }
            }
            runCatching { materialAssetRepo.deleteByIdAndMaterialId(assetId, materialId) }
        }
    }

    private fun find(materialId: UUID): StoredLessonMaterial? =
        lessonMaterialRepo.findRowById(materialId)

    private fun findAsset(assetId: UUID): StoredMaterialAsset? =
        materialAssetRepo.findById(assetId).orElse(null)

    private fun findAssets(materialId: UUID): List<StoredMaterialAsset> =
        materialAssetRepo.findByMaterialId(materialId)

    private fun accessibleScheduledMaterial(authentication: JwtAuthenticationToken, lessonId: UUID): ScheduledMaterialLookup {
        val lookup = scheduledMaterialLookup(lessonId)
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)

        if (!authentication.canManageMaterials() && !lookup.isVisibleToParticipant(Instant.now())) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        if (!authentication.canManageMaterials() && !isLessonParticipant(lessonId, authentication.token.subject)) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.SCHEDULED_LESSON_NOT_FOUND)
        }

        if (lookup.materialId == null) {
            throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_NOT_FOUND)
        }
        return lookup
    }

    private fun scheduledMaterialLookup(lessonId: UUID): ScheduledMaterialLookup? =
        lessonRepo.findScheduledMaterialLookup(lessonId)

    private fun findOrCreateMaterialSubmissionAssignment(lessonId: UUID, material: StoredLessonMaterial): UUID =
        findMaterialSubmissionAssignment(lessonId, material.id) ?: run {
            val now = Instant.now()
            assignmentRepo.saveAndFlush(
                AssignmentEntity(
                    id = UUID.randomUUID(),
                    lessonId = lessonId,
                    title = material.title,
                    instructions = "Play&Say material answer snapshot",
                    type = "MATERIAL_WORK",
                    payload = objectMapper.writeValueAsString(objectMapper.createObjectNode().put("source", "material")),
                    maxScore = materialScoringService.maxScore(material.scoringRubric),
                    materialId = material.id,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
                .id
        }

    private fun createEmptyMaterialSubmission(
        assignmentId: UUID,
        lessonId: UUID,
        materialId: UUID,
        userId: UUID,
    ): StoredMaterialSubmission {
        val now = Instant.now()
        val submission = submissionRepo.saveAndFlush(
            SubmissionEntity(
                id = UUID.randomUUID(),
                assignmentId = assignmentId,
                studentUserId = userId,
                lessonId = lessonId,
                content = emptyMaterialSubmissionContent(materialId),
                score = null,
                errorsCount = null,
                submittedAt = null,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return requireNotNull(findMaterialSubmission(submission.id))
    }

    private fun createEmptyMaterialAnnotation(lessonId: UUID, materialId: UUID): StoredMaterialAnnotation {
        val now = Instant.now()
        val annotation = lessonMaterialAnnotationRepo.saveAndFlush(
            LessonMaterialAnnotationEntity(
                id = UUID.randomUUID(),
                lessonId = lessonId,
                materialId = materialId,
                content = emptyMaterialAnnotationContent(),
                createdAt = now,
                updatedAt = now,
            ),
        )
        return requireNotNull(findMaterialAnnotation(annotation.id))
    }

    private fun emptyMaterialSubmissionContent(materialId: UUID): String {
        val root = objectMapper.createObjectNode()
        root.put("schemaVersion", 1)
        root.put("materialId", materialId.toString())
        root.set<ObjectNode>("answers", objectMapper.createObjectNode())
        return objectMapper.writeValueAsString(root)
    }

    private fun emptyMaterialAnnotationContent(): String {
        val root = objectMapper.createObjectNode()
        root.put("schemaVersion", 1)
        root.set<ArrayNode>("strokes", objectMapper.createArrayNode())
        return objectMapper.writeValueAsString(root)
    }

    private fun findMaterialSubmissionAssignment(lessonId: UUID, materialId: UUID): UUID? =
        assignmentRepo.findFirstByLessonIdAndMaterialIdAndMaterialBlockIdIsNullAndTypeOrderByCreatedAtAsc(
            lessonId = lessonId,
            materialId = materialId,
            type = "MATERIAL_WORK",
        )?.id

    private fun findMaterialSubmission(assignmentId: UUID, lessonId: UUID, userId: UUID): StoredMaterialSubmission? =
        submissionRepo.findFirstByAssignmentIdAndLessonIdAndStudentUserIdOrderByUpdatedAtDesc(
            assignmentId = assignmentId,
            lessonId = lessonId,
            studentUserId = userId,
        )?.let { submission -> findMaterialSubmission(submission.id) }

    private fun findMaterialSubmission(submissionId: UUID): StoredMaterialSubmission? =
        submissionRepo.findMaterialSubmissionRowById(submissionId)

    private fun findMaterialAnnotation(lessonId: UUID, materialId: UUID): StoredMaterialAnnotation? =
        lessonMaterialAnnotationRepo.findByLessonIdAndMaterialId(lessonId, materialId)

    private fun findMaterialAnnotation(annotationId: UUID): StoredMaterialAnnotation? =
        lessonMaterialAnnotationRepo.findById(annotationId).orElse(null)

    private fun isLessonParticipant(lessonId: UUID, subject: String): Boolean =
        lessonParticipantRepo.countByLessonIdAndStudentSubject(lessonId, subject) > 0

    private fun isActiveMaterialParticipant(materialId: UUID, subject: String, now: Instant): Boolean =
        lessonRepo.countActiveMaterialParticipant(
            materialId = materialId,
            subject = subject,
            now = now,
            excludedStatuses = expiredMaterialParticipantStatuses,
        ) > 0

    private fun JwtAuthenticationToken.currentUserIdIfNeeded(): UUID? =
        if (canManageMaterials()) userProfileStore.currentUserId(this) else null

}

private fun LessonMaterialRequest.validated(
    objectMapper: ObjectMapper,
    messageProvider: MessageProvider,
): ValidatedLessonMaterialRequest {
    val title = title.requiredClean("title", 160)
    val language = language.requiredClean("language", 16)
    val cefrLevel = cefrLevel.trim().uppercase()
    if (cefrLevel !in cefrLevels) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_CEFR_LEVEL)
    }
    val visibility = visibility.trim().uppercase()
    if (visibility !in materialVisibilities) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_MATERIAL_VISIBILITY)
    }
    val status = status.trim().uppercase()
    if (status !in materialStatuses) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_MATERIAL_STATUS)
    }

    val document = document ?: defaultMaterialDocument(title, objectMapper, messageProvider)
    val sourceMeta = sourceMeta ?: objectMapper.createObjectNode().put("kind", "MANUAL")
    val scoringRubric = scoringRubric ?: defaultScoringRubric(objectMapper, messageProvider)

    validateJsonSize("document", document, objectMapper, 6_000_000)
    validateJsonSize("sourceMeta", sourceMeta, objectMapper, 40_000)
    validateJsonSize("scoringRubric", scoringRubric, objectMapper, 40_000)

    return ValidatedLessonMaterialRequest(
        title = title,
        description = description.optionalClean("description", 2_000),
        language = language,
        cefrLevel = cefrLevel,
        visibility = visibility,
        status = status,
        document = document,
        sourceMeta = sourceMeta,
        scoringRubric = scoringRubric,
    )
}

private fun StoredLessonMaterial.canRead(authentication: JwtAuthenticationToken, currentUserId: UUID?): Boolean {
    if (authentication.isMaterialAdmin()) {
        return true
    }
    if (authentication.canManageMaterials() && ownerTeacherUserId == currentUserId) {
        return true
    }
    return visibility == "PUBLIC" && status == "PUBLISHED"
}

private fun StoredLessonMaterial.canEdit(authentication: JwtAuthenticationToken, currentUserId: UUID?): Boolean =
    authentication.isMaterialAdmin() || (authentication.canManageMaterials() && ownerTeacherUserId == currentUserId)

private fun StoredLessonMaterial.toResponse(objectMapper: ObjectMapper): LessonMaterialResponse {
    val documentNode = objectMapper.readTree(document)
    return LessonMaterialResponse(
        id = id,
        ownerTeacherUserId = ownerTeacherUserId,
        ownerTeacherSubject = ownerTeacherSubject,
        ownerTeacherName = ownerTeacherName,
        title = title,
        description = description,
        language = language,
        cefrLevel = cefrLevel,
        visibility = visibility,
        status = status,
        document = documentNode,
        sourceMeta = objectMapper.readTree(sourceMeta),
        scoringRubric = objectMapper.readTree(scoringRubric),
        blockCount = documentNode.blockCount(),
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
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

private fun StoredMaterialSubmission.toResponse(objectMapper: ObjectMapper): MaterialSubmissionResponse =
    MaterialSubmissionResponse(
        id = id,
        assignmentId = assignmentId,
        lessonId = requireNotNull(lessonId),
        materialId = requireNotNull(materialId),
        userId = userId,
        userSubject = userSubject,
        userName = userName,
        content = objectMapper.readTree(requireNotNull(content)),
        score = score,
        errorsCount = errorsCount,
        submittedAt = submittedAt,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun StoredMaterialAnnotation.toResponse(objectMapper: ObjectMapper): MaterialAnnotationResponse =
    MaterialAnnotationResponse(
        id = id,
        lessonId = lessonId,
        materialId = materialId,
        content = objectMapper.readTree(content),
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

private fun JwtAuthenticationToken.requireMaterialManager() {
    if (!canManageMaterials()) {
        throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
    }
}

private fun JwtAuthenticationToken.canManageMaterials(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN }

private fun JwtAuthenticationToken.isMaterialAdmin(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }

private fun String.requiredClean(fieldName: String, maxLength: Int): String =
    optionalClean(fieldName, maxLength)
        ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, fieldName)

private fun String?.optionalClean(fieldName: String, maxLength: Int): String? {
    val cleaned = this?.trim()?.takeIf { it.isNotEmpty() }
    if (cleaned != null && cleaned.length > maxLength) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, fieldName, maxLength)
    }
    return cleaned
}

private fun String?.validatedImageDataUrl(fieldName: String): String? {
    val cleaned = optionalClean(fieldName, materialAiSourceImageDataUrlMaxLength) ?: return null
    val prefix = materialAiImageDataUrlPrefixes.firstOrNull { prefix -> cleaned.startsWith(prefix) }
        ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.IMAGE_DATA_URL_INVALID_TYPE, fieldName)
    val encoded = cleaned.removePrefix(prefix)
    if (encoded.isBlank()) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_EMPTY, fieldName)
    }
    runCatching { Base64.getDecoder().decode(encoded) }
        .getOrElse { throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.IMAGE_DATA_URL_INVALID_BASE64, fieldName) }
    return cleaned
}

private fun validateJsonSize(fieldName: String, value: JsonNode, objectMapper: ObjectMapper, maxBytes: Int) {
    val byteSize = objectMapper.writeValueAsBytes(value).size
    if (byteSize > maxBytes) {
        throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.JSON_FIELD_TOO_LARGE, fieldName, maxBytes)
    }
}

private fun inferCefrLevel(prompt: String): String {
    val lower = prompt.lowercase()
    return when {
        listOf("c1", "advanced", "debate", "academic").any { marker -> marker in lower } -> "C1"
        listOf("b2", "upper", "argument", "presentation").any { marker -> marker in lower } -> "B2"
        listOf("b1", "intermediate", "story", "travel").any { marker -> marker in lower } -> "B1"
        listOf("a1", "beginner", "kids", "alphabet").any { marker -> marker in lower } -> "A1"
        listOf("a2", "elementary").any { marker -> marker in lower } -> "A2"
        else -> "A2"
    }
}

private fun ScheduledMaterialLookup.isVisibleToParticipant(now: Instant): Boolean =
    status !in expiredMaterialParticipantStatuses && scheduledEnd?.isAfter(now) != false

private val cefrLevels = setOf("A1", "A2", "B1", "B2", "C1", "C2")
private val materialStatuses = setOf("DRAFT", "PUBLISHED", "ARCHIVED")
private val materialVisibilities = setOf("PRIVATE", "PUBLIC")
private val expiredMaterialParticipantStatuses = setOf(MetaData.LessonStatuses.COMPLETED, MetaData.LessonStatuses.CANCELLED)
private val materialAiImageDataUrlPrefixes = listOf(
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,",
)

private fun String.materialImageExtension(): String =
    when (lowercase()) {
        "image/jpeg", "image/jpg" -> "jpg"
        "image/png" -> "png"
        "image/webp" -> "webp"
        "image/svg+xml" -> "svg"
        else -> "bin"
    }
