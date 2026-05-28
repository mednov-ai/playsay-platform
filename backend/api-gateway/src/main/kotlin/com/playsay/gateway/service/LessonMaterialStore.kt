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
import java.math.BigDecimal
import java.math.RoundingMode
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
    private val materialImageGenerationService: MaterialImageGenerationService,
    private val materialUrlImportService: MaterialUrlImportService,
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
            throw ProjectResponseException(HttpStatus.FORBIDDEN, "Only the material owner or admin can edit this material.")
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
            throw ProjectResponseException(HttpStatus.FORBIDDEN, "Only the material owner or admin can archive this material.")
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
        val scoring = scoreMaterialSubmission(material, request.content)
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

    private fun scoreMaterialSubmission(material: StoredLessonMaterial, content: JsonNode): MaterialSubmissionScore? {
        val document = runCatching { objectMapper.readTree(material.document) }.getOrNull() ?: return null
        val answerRoot = content.get("answers")?.takeIf { node -> node.isObject } ?: return null
        val pages = document.get("pages") as? ArrayNode ?: return null
        val assessedContent = (content as? ObjectNode)?.deepCopy() ?: objectMapper.createObjectNode().apply {
            set<JsonNode>("answers", answerRoot)
        }
        val itemResults = objectMapper.createArrayNode()
        var totalWeight = BigDecimal.ZERO
        var earnedWeight = BigDecimal.ZERO
        var errorsCount = 0

        pages.forEach { page ->
            val blocks = page.get("blocks") as? ArrayNode ?: return@forEach
            blocks.forEach { block ->
                val blockId = block.get("id")?.asText()?.takeIf { value -> value.isNotBlank() } ?: return@forEach
                val blockType = block.get("type")?.asText().orEmpty()
                val answerBlock = answerRoot.get(blockId)
                when (blockType) {
                    "fillGaps",
                    "multipleChoice"
                    -> {
                        val answerItems = answerBlock?.get("items")?.takeIf { node -> node.isObject }
                        val items = block.get("items") as? ArrayNode ?: return@forEach
                        items.forEachIndexed { index, item ->
                            val expected = item.acceptedAnswers()
                            if (expected.isEmpty()) {
                                return@forEachIndexed
                            }
                            val prompt = item.get("prompt")?.asText().orEmpty()
                            val key = "$prompt-$index"
                            val actual = answerItems?.get(key)?.asText()
                            val result = scoreObjectiveItem(
                                block = block,
                                item = item,
                                blockId = blockId,
                                blockType = blockType,
                                itemKey = key,
                                expectedAnswers = expected,
                                actual = actual,
                                answerBlock = answerBlock,
                            )
                            totalWeight += result.weight
                            earnedWeight += result.earnedWeight
                            errorsCount += result.errorsCount
                            itemResults.add(result.toJson(objectMapper))
                        }
                    }
                    "matchingPairs" -> {
                        val matches = answerBlock?.get("matches")?.takeIf { node -> node.isObject }
                        val pairs = block.get("pairs") as? ArrayNode ?: return@forEach
                        pairs.forEach { pair ->
                            val expectedPairId = pair.get("id")?.asText()?.takeIf { value -> value.isNotBlank() }
                                ?: return@forEach
                            val result = scoreObjectiveItem(
                                block = block,
                                item = pair,
                                blockId = blockId,
                                blockType = blockType,
                                itemKey = expectedPairId,
                                expectedAnswers = listOf(expectedPairId),
                                actual = matches?.get(expectedPairId)?.asText(),
                                answerBlock = answerBlock,
                            )
                            totalWeight += result.weight
                            earnedWeight += result.earnedWeight
                            errorsCount += result.errorsCount
                            itemResults.add(result.toJson(objectMapper))
                        }
                    }
                }
            }
        }

        if (totalWeight.compareTo(BigDecimal.ZERO) == 0) {
            return null
        }

        val maxScore = materialMaxScore(material.scoringRubric) ?: BigDecimal.TEN
        val score = maxScore
            .multiply(earnedWeight)
            .divide(totalWeight, 2, RoundingMode.HALF_UP)
        val assessment = objectMapper.createObjectNode().apply {
            put("schemaVersion", 1)
            put("maxScore", maxScore)
            put("score", score)
            put("errorsCount", errorsCount)
            put("totalWeight", totalWeight)
            put("earnedWeight", earnedWeight)
            set<ArrayNode>("items", itemResults)
        }
        assessedContent.set<ObjectNode>("assessment", assessment)

        return MaterialSubmissionScore(
            score = score,
            errorsCount = errorsCount,
            content = assessedContent,
        )
    }

    private fun scoreObjectiveItem(
        block: JsonNode,
        item: JsonNode,
        blockId: String,
        blockType: String,
        itemKey: String,
        expectedAnswers: List<String>,
        actual: String?,
        answerBlock: JsonNode?,
    ): ObjectiveItemScore {
        val policy = materialAssessmentPolicy(block, item)
        val validation = materialAnswerValidation(block, item)
        val override = answerTeacherOverride(answerBlock, itemKey)
        val attempts = answerAttemptValues(answerBlock, itemKey, actual)
        val hints = answerHints(answerBlock, itemKey, policy)
        val actualCorrect = expectedAnswers.any { expected -> answersMatch(actual, expected, validation) }
        val correct = override?.correct ?: actualCorrect
        val incorrectAttempts = attempts.count { attempt ->
            expectedAnswers.none { expected -> answersMatch(attempt, expected, validation) }
        }
        val attemptsUsed = attempts.size.takeIf { count -> count > 0 } ?: if (actual.isNullOrBlank()) 0 else 1
        val attemptFactor = if (correct) {
            BigDecimal.ONE
                .subtract(policy.attemptPenalty.multiply(BigDecimal.valueOf((attemptsUsed - 1).coerceAtLeast(0).toLong())))
                .max(policy.minimumCorrectFactor)
        } else {
            BigDecimal.ZERO
        }
        val hintPenalty = hints.fold(BigDecimal.ZERO) { total, hint -> total + hint.penalty }
        val hintFactor = BigDecimal.ONE.subtract(hintPenalty).max(policy.minimumHintFactor)
        val overrideFactor = override?.scoreFactor
        val scoreFactor = if (!correct) {
            BigDecimal.ZERO
        } else {
            listOfNotNull(attemptFactor, hintFactor, overrideFactor).minOrNull() ?: BigDecimal.ONE
        }.between(BigDecimal.ZERO, BigDecimal.ONE)
        val earnedWeight = policy.weight.multiply(scoreFactor)
        val errorsCount = if (attempts.isNotEmpty()) {
            incorrectAttempts
        } else if (!correct) {
            1
        } else {
            0
        }

        return ObjectiveItemScore(
            blockId = blockId,
            blockType = blockType,
            itemKey = itemKey,
            correct = correct,
            actual = actual?.trim(),
            weight = policy.weight,
            earnedWeight = earnedWeight,
            scoreFactor = scoreFactor,
            attemptsUsed = attemptsUsed,
            incorrectAttempts = incorrectAttempts,
            hintsUsed = hints.size,
            errorsCount = errorsCount,
            status = when {
                correct && hints.isEmpty() && attemptsUsed <= 1 -> "CORRECT"
                correct && hints.isNotEmpty() -> "CORRECT_WITH_HINT"
                correct -> "CORRECT_AFTER_RETRY"
                attemptsUsed >= policy.maxAttempts && policy.lockAfterAttempts -> "LOCKED"
                else -> "INCORRECT"
            },
        )
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
            throw ProjectResponseException(HttpStatus.FORBIDDEN, "Only the material owner or admin can edit generated images.")
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
            ?: throw ProjectResponseException(HttpStatus.NOT_FOUND, "Material asset not found.")
        val storageKey = asset.storageKey?.trim()?.takeIf { key -> key.isNotEmpty() }
            ?: throw ProjectResponseException(HttpStatus.NOT_FOUND, "Material asset content not found.")
        val content = try {
            materialObjectStorage.getObject(storageKey)
        } catch (exception: MaterialObjectNotFoundException) {
            throw ProjectResponseException(HttpStatus.NOT_FOUND, "Material asset not found.")
        } catch (exception: MaterialObjectStorageException) {
            throw ProjectResponseException(HttpStatus.BAD_GATEWAY, "Material asset storage failed.")
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
            throw ProjectResponseException(HttpStatus.FORBIDDEN, "Only the material owner or admin can edit assets.")
        }
        val asset = findAsset(assetId)
            ?.takeIf { found -> found.materialId == materialId }
            ?: throw ProjectResponseException(HttpStatus.NOT_FOUND, "Material asset not found.")
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
            throw ProjectResponseException(HttpStatus.BAD_GATEWAY, "Material asset storage failed.")
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
            throw ProjectResponseException(HttpStatus.BAD_GATEWAY, "Material asset storage failed.")
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
                    maxScore = materialMaxScore(material.scoringRubric),
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

private data class MaterialImageTarget(
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

private data class MaterialImageTargetDecision(
    val previousAssetId: UUID?,
)

private data class MaterialSubmissionScore(
    val score: BigDecimal,
    val errorsCount: Int,
    val content: JsonNode,
)

private data class AssessmentPolicy(
    val weight: BigDecimal = BigDecimal.ONE,
    val maxAttempts: Int = 3,
    val attemptPenalty: BigDecimal = BigDecimal("0.30"),
    val minimumCorrectFactor: BigDecimal = BigDecimal("0.40"),
    val defaultHintPenalty: BigDecimal = BigDecimal("0.15"),
    val minimumHintFactor: BigDecimal = BigDecimal("0.40"),
    val lockAfterAttempts: Boolean = true,
)

private data class AnswerValidationPolicy(
    val ignoreCase: Boolean = true,
    val ignorePunctuation: Boolean = true,
    val ignoreWhitespace: Boolean = true,
)

private data class UsedHint(
    val type: String,
    val penalty: BigDecimal,
)

private data class TeacherOverride(
    val correct: Boolean,
    val scoreFactor: BigDecimal?,
)

private data class ObjectiveItemScore(
    val blockId: String,
    val blockType: String,
    val itemKey: String,
    val correct: Boolean,
    val actual: String?,
    val weight: BigDecimal,
    val earnedWeight: BigDecimal,
    val scoreFactor: BigDecimal,
    val attemptsUsed: Int,
    val incorrectAttempts: Int,
    val hintsUsed: Int,
    val errorsCount: Int,
    val status: String,
)

private fun LessonMaterialRequest.validated(
    objectMapper: ObjectMapper,
    messageProvider: MessageProvider,
): ValidatedLessonMaterialRequest {
    val title = title.requiredClean("title", 160)
    val language = language.requiredClean("language", 16)
    val cefrLevel = cefrLevel.trim().uppercase()
    if (cefrLevel !in cefrLevels) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "Unsupported CEFR level.")
    }
    val visibility = visibility.trim().uppercase()
    if (visibility !in materialVisibilities) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "Unsupported material visibility.")
    }
    val status = status.trim().uppercase()
    if (status !in materialStatuses) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "Unsupported material status.")
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

private fun materialMaxScore(scoringRubric: String): BigDecimal? =
    runCatching {
        val node = jacksonObjectMapper().readTree(scoringRubric)
        node.get("maxScore")?.takeIf { value -> value.isNumber }?.decimalValue()
    }.getOrNull()

private fun normalizedScoringAnswer(value: String?): String =
    value
        ?.trim()
        ?.lowercase()
        ?.replace(Regex("\\s+"), " ")
        ?: ""

private fun JsonNode.acceptedAnswers(): List<String> =
    buildList {
        get("answer")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }?.let(::add)
        get("correct")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }?.let(::add)
        listOf("acceptedAnswers", "answers", "variants").forEach { field ->
            val values = get(field) as? ArrayNode ?: return@forEach
            values.forEach { value ->
                value.asText()?.trim()?.takeIf { item -> item.isNotEmpty() }?.let(::add)
            }
        }
    }.distinct()

private fun materialAssessmentPolicy(block: JsonNode, item: JsonNode): AssessmentPolicy {
    val blockAssessment = block.get("assessment")?.takeIf { node -> node.isObject }
    val itemAssessment = item.get("assessment")?.takeIf { node -> node.isObject }
    fun decimal(name: String, default: BigDecimal): BigDecimal =
        itemAssessment?.decimalField(name)
            ?: item.decimalField(name)
            ?: blockAssessment?.decimalField(name)
            ?: block.decimalField(name)
            ?: default
    fun int(name: String, default: Int): Int =
        itemAssessment?.intField(name)
            ?: item.intField(name)
            ?: blockAssessment?.intField(name)
            ?: block.intField(name)
            ?: default
    fun boolean(name: String, default: Boolean): Boolean =
        itemAssessment?.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: item.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: blockAssessment?.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: block.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: default

    return AssessmentPolicy(
        weight = decimal("weight", BigDecimal.ONE).between(BigDecimal("0.10"), BigDecimal("20")),
        maxAttempts = int("maxAttempts", 3).coerceIn(1, 10),
        attemptPenalty = decimal("attemptPenalty", BigDecimal("0.30")).between(BigDecimal.ZERO, BigDecimal.ONE),
        minimumCorrectFactor = decimal("minimumCorrectFactor", BigDecimal("0.40")).between(BigDecimal.ZERO, BigDecimal.ONE),
        defaultHintPenalty = decimal("hintPenalty", BigDecimal("0.15")).between(BigDecimal.ZERO, BigDecimal.ONE),
        minimumHintFactor = decimal("minimumHintFactor", BigDecimal("0.40")).between(BigDecimal.ZERO, BigDecimal.ONE),
        lockAfterAttempts = boolean("lockAfterAttempts", true),
    )
}

private fun materialAnswerValidation(block: JsonNode, item: JsonNode): AnswerValidationPolicy {
    val blockValidation = block.get("answerValidation")?.takeIf { node -> node.isObject }
    val itemValidation = item.get("answerValidation")?.takeIf { node -> node.isObject }
    fun boolean(name: String, default: Boolean): Boolean =
        itemValidation?.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: blockValidation?.get(name)?.takeIf { node -> node.isBoolean }?.asBoolean()
            ?: default

    return AnswerValidationPolicy(
        ignoreCase = boolean("ignoreCase", true),
        ignorePunctuation = boolean("ignorePunctuation", true),
        ignoreWhitespace = boolean("ignoreWhitespace", true),
    )
}

private fun answerAttemptValues(answerBlock: JsonNode?, itemKey: String, actual: String?): List<String> {
    val attemptsNode = answerBlock?.get("attempts")?.get(itemKey)
    val attempts = when {
        attemptsNode is ArrayNode -> attemptsNode.mapNotNull { node ->
            when {
                node.isTextual -> node.asText()
                node.isObject -> node.get("value")?.asText()
                else -> null
            }?.trim()?.takeIf { value -> value.isNotEmpty() }
        }
        attemptsNode?.isTextual == true -> listOfNotNull(attemptsNode.asText().trim().takeIf { value -> value.isNotEmpty() })
        else -> emptyList()
    }
    return attempts.ifEmpty {
        listOfNotNull(actual?.trim()?.takeIf { value -> value.isNotEmpty() })
    }
}

private fun answerHints(answerBlock: JsonNode?, itemKey: String, policy: AssessmentPolicy): List<UsedHint> {
    val hintsNode = answerBlock?.get("hints")?.get(itemKey) ?: return emptyList()
    if (hintsNode !is ArrayNode) {
        return emptyList()
    }
    return hintsNode.mapNotNull { node ->
        when {
            node.isTextual -> UsedHint(type = node.asText().ifBlank { "hint" }, penalty = policy.defaultHintPenalty)
            node.isObject -> {
                val type = node.get("type")?.asText()?.ifBlank { "hint" } ?: "hint"
                val penalty = node.decimalField("penalty")
                    ?: node.decimalField("scorePenalty")
                    ?: policy.defaultHintPenalty
                UsedHint(type = type, penalty = penalty.between(BigDecimal.ZERO, BigDecimal.ONE))
            }
            else -> null
        }
    }
}

private fun answerTeacherOverride(answerBlock: JsonNode?, itemKey: String): TeacherOverride? {
    val overrideNode = answerBlock?.get("teacherOverride")?.get(itemKey)
        ?: answerBlock?.get("overrides")?.get(itemKey)
        ?: return null
    if (!overrideNode.isObject) {
        return null
    }
    val correct = overrideNode.get("correct")?.takeIf { node -> node.isBoolean }?.asBoolean() ?: return null
    val scoreFactor = overrideNode.decimalField("scoreFactor")?.between(BigDecimal.ZERO, BigDecimal.ONE)
    return TeacherOverride(correct = correct, scoreFactor = scoreFactor)
}

private fun answersMatch(actual: String?, expected: String, validation: AnswerValidationPolicy): Boolean =
    normalizedAssessmentAnswer(actual, validation) == normalizedAssessmentAnswer(expected, validation)

private fun normalizedAssessmentAnswer(value: String?, validation: AnswerValidationPolicy): String {
    var normalized = value?.trim() ?: ""
    if (validation.ignoreCase) {
        normalized = normalized.lowercase()
    }
    if (validation.ignorePunctuation) {
        normalized = normalized.replace(Regex("[\\p{Punct}]+"), "")
    }
    if (validation.ignoreWhitespace) {
        normalized = normalized.replace(Regex("\\s+"), " ")
    }
    return normalized.trim()
}

private fun JsonNode.decimalField(name: String): BigDecimal? {
    val node = get(name) ?: return null
    return when {
        node.isNumber -> node.decimalValue()
        node.isTextual -> node.asText().trim().takeIf { value -> value.isNotEmpty() }?.let { value ->
            runCatching { BigDecimal(value) }.getOrNull()
        }
        else -> null
    }
}

private fun JsonNode.intField(name: String): Int? {
    val node = get(name) ?: return null
    return when {
        node.isInt || node.isLong -> node.asInt()
        node.isTextual -> node.asText().trim().toIntOrNull()
        else -> null
    }
}

private fun BigDecimal.between(min: BigDecimal, max: BigDecimal): BigDecimal =
    this.max(min).min(max)

private fun ObjectiveItemScore.toJson(objectMapper: ObjectMapper): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("blockId", blockId)
        put("blockType", blockType)
        put("itemKey", itemKey)
        actual?.let { value -> put("actual", value) }
        put("correct", correct)
        put("status", status)
        put("weight", weight)
        put("earnedWeight", earnedWeight)
        put("scoreFactor", scoreFactor)
        put("attemptsUsed", attemptsUsed)
        put("incorrectAttempts", incorrectAttempts)
        put("hintsUsed", hintsUsed)
        put("errorsCount", errorsCount)
    }

private fun materialImageTargets(
    document: ObjectNode,
    blockId: String?,
    maxImages: Int,
    regenerate: Boolean,
    existingAssets: Map<UUID, StoredMaterialAsset>,
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

private fun materialImageTargetDecision(
    imageUrl: String,
    imagePrompt: String,
    regenerate: Boolean,
    existingAssets: Map<UUID, StoredMaterialAsset>,
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
    asset: StoredMaterialAsset,
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

private fun JwtAuthenticationToken.requireMaterialManager() {
    if (!canManageMaterials()) {
        throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED)
    }
}

private fun JwtAuthenticationToken.canManageMaterials(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN }

private fun JwtAuthenticationToken.isMaterialAdmin(): Boolean =
    authorities.any { authority -> authority.authority == MetaData.Authorities.ADMIN }

private fun defaultMaterialDocument(
    title: String,
    objectMapper: ObjectMapper,
    messageProvider: MessageProvider,
): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("schemaVersion", 1)
        putArray("pages").add(
            objectMapper.createObjectNode().apply {
                put("id", "page-1")
                put("title", title)
                put("layout", "FLOW")
                putArray("blocks").add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-text-1")
                        put("type", "text")
                        put("title", messageProvider[MetaData.Messages.MATERIAL_NEW_BLOCK_TITLE])
                        put("body", messageProvider[MetaData.Messages.MATERIAL_NEW_BLOCK_BODY])
                    },
                )
            },
        )
    }

private fun aiDraftDocument(
    title: String,
    prompt: String,
    language: String,
    cefrLevel: String,
    objectMapper: ObjectMapper,
    messageProvider: MessageProvider,
): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("schemaVersion", 1)
        putArray("pages").add(
            objectMapper.createObjectNode().apply {
                put("id", "page-warmup")
                put("title", title)
                put("layout", "FLOW")
                val blocks = putArray("blocks")
                blocks.add(textBlock(objectMapper, "block-goal", messageProvider[MetaData.Messages.MATERIAL_GOAL_TITLE], prompt))
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-vocab")
                        put("type", "flashcards")
                        put("title", "Useful words")
                        putArray("cards")
                            .add(flashcard(objectMapper, "topic", "topic", messageProvider[MetaData.Messages.FLASHCARD_TOPIC_TRANSLATION], "Let's discuss this topic."))
                            .add(flashcard(objectMapper, "opinion", "opinion", messageProvider[MetaData.Messages.FLASHCARD_OPINION_TRANSLATION], "I think it is useful."))
                            .add(flashcard(objectMapper, "because", "because", messageProvider[MetaData.Messages.FLASHCARD_BECAUSE_TRANSLATION], "I agree because..."))
                    },
                )
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-gap")
                        put("type", "fillGaps")
                        put("title", "Complete the ideas")
                        put("instruction", "Choose words that fit the meaning.")
                        putArray("items")
                            .add(gapItem(objectMapper, "I can talk about ___ in English.", "this topic"))
                            .add(gapItem(objectMapper, "My opinion is ___ because it is useful.", "positive"))
                    },
                )
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-speaking")
                        put("type", "speakingPrompt")
                        put("title", "Let's speak")
                        put("prompt", "Ask your partner three questions about the topic, then share one answer.")
                        put("level", cefrLevel)
                        put("language", language)
                    },
                )
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-writing")
                        put("type", "freeWriting")
                        put("title", "Short answer")
                        put("prompt", "Write 3-5 sentences using the new words.")
                        put("minWords", 20)
                    },
                )
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-drawing")
                        put("type", "drawingArea")
                        put("title", "Teacher notes")
                        put("height", 220)
                    },
                )
            },
        )
    }

private fun textBlock(objectMapper: ObjectMapper, id: String, title: String, body: String): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("id", id)
        put("type", "text")
        put("title", title)
        put("body", body)
    }

private fun flashcard(objectMapper: ObjectMapper, id: String, front: String, back: String, example: String): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("id", id)
        put("front", front)
        put("back", back)
        put("example", example)
    }

private fun gapItem(objectMapper: ObjectMapper, prompt: String, answer: String): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("prompt", prompt)
        put("answer", answer)
    }

private fun defaultScoringRubric(
    objectMapper: ObjectMapper,
    messageProvider: MessageProvider,
): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("maxScore", 10)
        putArray("criteria")
            .add(criteria(objectMapper, "taskCompletion", messageProvider[MetaData.Messages.RUBRIC_TASK_COMPLETION], 4))
            .add(criteria(objectMapper, "grammar", messageProvider[MetaData.Messages.RUBRIC_GRAMMAR], 2))
            .add(criteria(objectMapper, "vocabulary", messageProvider[MetaData.Messages.RUBRIC_VOCABULARY], 2))
            .add(criteria(objectMapper, "fluency", messageProvider[MetaData.Messages.RUBRIC_FLUENCY], 2))
        putArray("analysisFlags")
            .add("taskCompletion")
            .add("grammar")
            .add("vocabulary")
            .add("spelling")
    }

private fun criteria(objectMapper: ObjectMapper, key: String, label: String, weight: Int): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("key", key)
        put("label", label)
        put("weight", weight)
    }

private fun JsonNode.blockCount(): Int {
    val pages = get("pages")
    if (pages !is ArrayNode) {
        return 0
    }
    return pages.sumOf { page ->
        val blocks = page.get("blocks")
        if (blocks is ArrayNode) blocks.size() else 0
    }
}

private fun String.requiredClean(fieldName: String, maxLength: Int): String =
    optionalClean(fieldName, maxLength)
        ?: throw ProjectResponseException(HttpStatus.BAD_REQUEST, "$fieldName is required.")

private fun String?.optionalClean(fieldName: String, maxLength: Int): String? {
    val cleaned = this?.trim()?.takeIf { it.isNotEmpty() }
    if (cleaned != null && cleaned.length > maxLength) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "$fieldName must be at most $maxLength characters.")
    }
    return cleaned
}

private fun String?.validatedImageDataUrl(fieldName: String): String? {
    val cleaned = optionalClean(fieldName, materialAiSourceImageDataUrlMaxLength) ?: return null
    val prefix = materialAiImageDataUrlPrefixes.firstOrNull { prefix -> cleaned.startsWith(prefix) }
        ?: throw ProjectResponseException(HttpStatus.BAD_REQUEST, "$fieldName must be a JPEG, PNG, or WebP data URL.")
    val encoded = cleaned.removePrefix(prefix)
    if (encoded.isBlank()) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "$fieldName is empty.")
    }
    runCatching { Base64.getDecoder().decode(encoded) }
        .getOrElse { throw ProjectResponseException(HttpStatus.BAD_REQUEST, "$fieldName must contain valid base64 image data.") }
    return cleaned
}

private fun validateJsonSize(fieldName: String, value: JsonNode, objectMapper: ObjectMapper, maxBytes: Int) {
    val byteSize = objectMapper.writeValueAsBytes(value).size
    if (byteSize > maxBytes) {
        throw ProjectResponseException(HttpStatus.BAD_REQUEST, "$fieldName must be at most $maxBytes bytes.")
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
