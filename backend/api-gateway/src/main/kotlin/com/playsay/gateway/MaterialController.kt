package com.playsay.gateway

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.math.BigDecimal
import java.math.RoundingMode
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class LessonMaterialRequest(
    @field:Schema(maxLength = 160)
    val title: String,
    @field:Schema(maxLength = 2_000, nullable = true)
    val description: String? = null,
    @field:Schema(maxLength = 16)
    val language: String = "en",
    @field:Schema(allowableValues = ["A1", "A2", "B1", "B2", "C1", "C2"])
    val cefrLevel: String = "A2",
    @field:Schema(allowableValues = ["PRIVATE", "PUBLIC"])
    val visibility: String = "PRIVATE",
    @field:Schema(allowableValues = ["DRAFT", "PUBLISHED", "ARCHIVED"])
    val status: String = "DRAFT",
    val document: JsonNode? = null,
    val sourceMeta: JsonNode? = null,
    val scoringRubric: JsonNode? = null,
)

data class LessonMaterialResponse(
    val id: UUID,
    val ownerTeacherUserId: UUID?,
    val ownerTeacherSubject: String?,
    val ownerTeacherName: String?,
    val title: String,
    val description: String?,
    val language: String,
    val cefrLevel: String,
    val visibility: String,
    val status: String,
    val document: JsonNode,
    val sourceMeta: JsonNode,
    val scoringRubric: JsonNode,
    val blockCount: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class MaterialAssetRequest(
    @field:Schema(allowableValues = ["IMAGE", "GENERATED_IMAGE", "DOCUMENT_SCAN", "VIDEO_EMBED", "EXTERNAL_SOURCE", "AUDIO_NOTE"])
    val kind: String,
    val storageKey: String? = null,
    val externalUrl: String? = null,
    @field:Schema(allowableValues = ["YOUTUBE", "VK", "RUTUBE", "URL", "UPLOAD", "AI"])
    val provider: String = "UPLOAD",
    val metadata: JsonNode? = null,
)

data class MaterialAssetResponse(
    val id: UUID,
    val materialId: UUID,
    val kind: String,
    val storageKey: String?,
    val externalUrl: String?,
    val provider: String,
    val metadata: JsonNode,
    val createdAt: Instant,
)

data class MaterialAiDraftRequest(
    @field:Schema(maxLength = 160, nullable = true)
    val title: String? = null,
    @field:Schema(maxLength = 4_000)
    val prompt: String,
    @field:Schema(maxLength = 16)
    val language: String = "en",
    @field:Schema(allowableValues = ["A1", "A2", "B1", "B2", "C1", "C2"], nullable = true)
    val cefrLevel: String? = null,
    @field:Schema(
        description = "Optional JPEG/PNG/WebP data URL for a worksheet scan/photo. The API stores only metadata, not this data URL.",
        maxLength = 2_500_000,
        nullable = true,
    )
    val sourceImageDataUrl: String? = null,
    @field:Schema(maxLength = 160, nullable = true)
    val sourceFileName: String? = null,
)

data class MaterialUrlImportRequest(
    @field:Schema(maxLength = 2_000)
    val url: String,
    @field:Schema(maxLength = 160, nullable = true)
    val title: String? = null,
    @field:Schema(maxLength = 2_000, nullable = true)
    val prompt: String? = null,
    @field:Schema(maxLength = 16)
    val language: String = "en",
    @field:Schema(allowableValues = ["A1", "A2", "B1", "B2", "C1", "C2"], nullable = true)
    val cefrLevel: String? = null,
)

data class MaterialGenerateImagesRequest(
    @field:Schema(maxLength = 80, nullable = true)
    val blockId: String? = null,
    @field:Schema(minimum = "1", maximum = "12", nullable = true)
    val maxImages: Int? = null,
)

data class LessonMaterialDraftResponse(
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

data class MaterialSubmissionRequest(
    val content: JsonNode,
    val submitted: Boolean = true,
)

data class MaterialSubmissionResponse(
    val id: UUID,
    val assignmentId: UUID,
    val lessonId: UUID,
    val materialId: UUID,
    val userId: UUID,
    val userSubject: String?,
    val userName: String?,
    val content: JsonNode,
    val score: BigDecimal?,
    val errorsCount: Int?,
    val submittedAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class MaterialAnnotationRequest(
    val content: JsonNode,
)

data class MaterialAnnotationResponse(
    val id: UUID,
    val lessonId: UUID,
    val materialId: UUID,
    val content: JsonNode,
    val createdAt: Instant,
    val updatedAt: Instant,
)

private data class StoredLessonMaterial(
    val id: UUID,
    val ownerTeacherUserId: UUID?,
    val ownerTeacherSubject: String?,
    val ownerTeacherName: String?,
    val title: String,
    val description: String?,
    val language: String,
    val cefrLevel: String,
    val visibility: String,
    val status: String,
    val document: String,
    val sourceMeta: String,
    val scoringRubric: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)

private data class StoredMaterialAsset(
    val id: UUID,
    val materialId: UUID,
    val kind: String,
    val storageKey: String?,
    val externalUrl: String?,
    val provider: String,
    val metadata: String,
    val createdAt: Instant,
)

private data class StoredMaterialSubmission(
    val id: UUID,
    val assignmentId: UUID,
    val lessonId: UUID,
    val materialId: UUID,
    val userId: UUID,
    val userSubject: String?,
    val userName: String?,
    val content: String,
    val score: BigDecimal?,
    val errorsCount: Int?,
    val submittedAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

private data class StoredMaterialAnnotation(
    val id: UUID,
    val lessonId: UUID,
    val materialId: UUID,
    val content: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)

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

private data class ValidatedMaterialAssetRequest(
    val kind: String,
    val storageKey: String?,
    val externalUrl: String?,
    val provider: String,
    val metadata: JsonNode,
)

private const val materialAiSourceImageDataUrlMaxLength = 2_500_000
private const val materialUrlImportPromptLimit = 8_000
private const val materialUrlImportPromptTextLimit = 6_000

@Component
class LessonMaterialStore(
    private val jdbcClient: JdbcClient,
    private val userProfileStore: UserProfileStore,
    private val materialAiDraftService: MaterialAiDraftService,
    private val materialImageGenerationService: MaterialImageGenerationService,
    private val materialUrlImportService: MaterialUrlImportService,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    @Transactional
    fun list(authentication: JwtAuthenticationToken): List<LessonMaterialResponse> {
        val sql: String
        val params = mutableMapOf<String, Any?>()

        when {
            authentication.isMaterialAdmin() -> {
                sql = materialSelect("WHERE m.status <> 'ARCHIVED' ORDER BY m.updated_at DESC, m.title")
            }
            authentication.canManageMaterials() -> {
                params["ownerTeacherUserId"] = userProfileStore.currentUserId(authentication)
                sql = materialSelect(
                    """
                    WHERE m.status <> 'ARCHIVED'
                      AND (
                            m.owner_teacher_user_id = :ownerTeacherUserId
                         OR (m.visibility = 'PUBLIC' AND m.status = 'PUBLISHED')
                      )
                    ORDER BY CASE WHEN m.owner_teacher_user_id = :ownerTeacherUserId THEN 0 ELSE 1 END,
                             m.updated_at DESC,
                             m.title
                    """.trimIndent(),
                )
            }
            else -> {
                sql = materialSelect(
                    """
                    WHERE m.visibility = 'PUBLIC'
                      AND m.status = 'PUBLISHED'
                    ORDER BY m.updated_at DESC, m.title
                    """.trimIndent(),
                )
            }
        }

        return jdbcClient.sql(sql)
            .params(params)
            .query(::mapMaterial)
            .list()
            .map { material -> material.toResponse(objectMapper) }
    }

    @Transactional
    fun get(authentication: JwtAuthenticationToken, materialId: UUID): LessonMaterialResponse {
        val currentUserId = authentication.currentUserIdIfNeeded()
        val material = find(materialId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        if (!material.canRead(authentication, currentUserId)) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        }
        return material.toResponse(objectMapper)
    }

    @Transactional
    fun create(authentication: JwtAuthenticationToken, request: LessonMaterialRequest): LessonMaterialResponse {
        authentication.requireMaterialManager()
        val ownerTeacherUserId = userProfileStore.currentUserId(authentication)
        val values = request.validated(objectMapper)
        val id = UUID.randomUUID()
        val now = Instant.now()

        jdbcClient.sql(
            """
            INSERT INTO lesson_material (
                id,
                owner_teacher_user_id,
                title,
                description,
                language,
                cefr_level,
                visibility,
                status,
                document,
                source_meta,
                scoring_rubric,
                created_at,
                updated_at
            ) VALUES (
                :id,
                :ownerTeacherUserId,
                :title,
                :description,
                :language,
                :cefrLevel,
                :visibility,
                :status,
                :document,
                :sourceMeta,
                :scoringRubric,
                :createdAt,
                :updatedAt
            )
            """.trimIndent(),
        )
            .param("id", id)
            .param("ownerTeacherUserId", ownerTeacherUserId)
            .param("title", values.title)
            .param("description", values.description)
            .param("language", values.language)
            .param("cefrLevel", values.cefrLevel)
            .param("visibility", values.visibility)
            .param("status", values.status)
            .param("document", objectMapper.writeValueAsString(values.document))
            .param("sourceMeta", objectMapper.writeValueAsString(values.sourceMeta))
            .param("scoringRubric", objectMapper.writeValueAsString(values.scoringRubric))
            .param("createdAt", now.toMaterialOffsetDateTime())
            .param("updatedAt", now.toMaterialOffsetDateTime())
            .update()

        return requireNotNull(find(id)).toResponse(objectMapper)
    }

    @Transactional
    fun update(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: LessonMaterialRequest,
    ): LessonMaterialResponse {
        val material = find(materialId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the material owner or admin can edit this material.")
        }

        val values = request.validated(objectMapper)
        jdbcClient.sql(
            """
            UPDATE lesson_material
               SET title = :title,
                   description = :description,
                   language = :language,
                   cefr_level = :cefrLevel,
                   visibility = :visibility,
                   status = :status,
                   document = :document,
                   source_meta = :sourceMeta,
                   scoring_rubric = :scoringRubric,
                   updated_at = :updatedAt
             WHERE id = :id
            """.trimIndent(),
        )
            .param("id", materialId)
            .param("title", values.title)
            .param("description", values.description)
            .param("language", values.language)
            .param("cefrLevel", values.cefrLevel)
            .param("visibility", values.visibility)
            .param("status", values.status)
            .param("document", objectMapper.writeValueAsString(values.document))
            .param("sourceMeta", objectMapper.writeValueAsString(values.sourceMeta))
            .param("scoringRubric", objectMapper.writeValueAsString(values.scoringRubric))
            .param("updatedAt", Instant.now().toMaterialOffsetDateTime())
            .update()

        return requireNotNull(find(materialId)).toResponse(objectMapper)
    }

    @Transactional
    fun archive(authentication: JwtAuthenticationToken, materialId: UUID) {
        val material = find(materialId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the material owner or admin can archive this material.")
        }

        jdbcClient.sql(
            """
            UPDATE lesson_material
               SET status = 'ARCHIVED',
                   updated_at = :updatedAt
             WHERE id = :id
            """.trimIndent(),
        )
            .param("id", materialId)
            .param("updatedAt", Instant.now().toMaterialOffsetDateTime())
            .update()
    }

    @Transactional(readOnly = true)
    fun getForScheduledLesson(authentication: JwtAuthenticationToken, lessonId: UUID): LessonMaterialResponse {
        val lesson = jdbcClient.sql(
            """
            SELECT l.id,
                   l.status,
                   l.scheduled_end,
                   COALESCE(l.material_id, lt.material_id) AS material_id
              FROM lesson l
              LEFT JOIN lesson_template lt ON lt.id = l.lesson_template_id
             WHERE l.id = :lessonId
            """.trimIndent(),
        )
            .param("lessonId", lessonId)
            .query { rs, _ ->
                ScheduledMaterialLookup(
                    id = rs.getObject("id", UUID::class.java),
                    status = rs.getString("status"),
                    scheduledEnd = rs.getObject("scheduled_end", OffsetDateTime::class.java)?.toInstant(),
                    materialId = rs.getObject("material_id", UUID::class.java),
                )
            }
            .optional()
            .orElse(null)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled lesson not found.")

        if (!authentication.canManageMaterials() && !lesson.isVisibleToParticipant(Instant.now())) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled lesson not found.")
        }

        if (!authentication.canManageMaterials() && !isLessonParticipant(lessonId, authentication.token.subject)) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled lesson not found.")
        }

        val materialId = lesson.materialId ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val material = find(materialId)?.takeIf { it.status != "ARCHIVED" }
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        return material.toResponse(objectMapper)
    }

    @Transactional
    fun getSubmissionForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): MaterialSubmissionResponse {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val userId = userProfileStore.currentUserId(authentication)
        val assignmentId = findMaterialSubmissionAssignment(lessonId, materialId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material submission not found.")
        val submission = findMaterialSubmission(assignmentId, lessonId, userId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material submission not found.")
        return submission.toResponse(objectMapper)
    }

    @Transactional(readOnly = true)
    fun listSubmissionsForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): List<MaterialSubmissionResponse> {
        authentication.requireMaterialManager()
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val assignmentId = findMaterialSubmissionAssignment(lessonId, materialId) ?: return emptyList()

        return jdbcClient.sql(
            """
            SELECT s.id,
                   s.assignment_id,
                   s.lesson_id,
                   a.material_id,
                   s.student_user_id,
                   student.keycloak_subject AS user_subject,
                   COALESCE(student.display_name, student.name, student.username, student.keycloak_subject) AS user_name,
                   s.content,
                   s.score,
                   s.errors_count,
                   s.submitted_at,
                   s.created_at,
                   s.updated_at
              FROM submission s
              JOIN assignment a ON a.id = s.assignment_id
              JOIN app_user student ON student.id = s.student_user_id
             WHERE s.assignment_id = :assignmentId
               AND s.lesson_id = :lessonId
             ORDER BY s.updated_at DESC
            """.trimIndent(),
        )
            .param("assignmentId", assignmentId)
            .param("lessonId", lessonId)
            .query(::mapMaterialSubmission)
            .list()
            .map { submission -> submission.toResponse(objectMapper) }
    }

    @Transactional
    fun saveSubmissionForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: MaterialSubmissionRequest,
    ): MaterialSubmissionResponse {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val material = find(materialId)?.takeIf { it.status != "ARCHIVED" }
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        validateJsonSize("content", request.content, objectMapper, 1_000_000)

        val userId = userProfileStore.currentUserId(authentication)
        val assignmentId = findOrCreateMaterialSubmissionAssignment(lessonId, material)
        val now = Instant.now()
        val content = objectMapper.writeValueAsString(request.content)
        val scoring = scoreMaterialSubmission(material, request.content)
        val existing = findMaterialSubmission(assignmentId, lessonId, userId)

        val submissionId = if (existing == null) {
            val id = UUID.randomUUID()
            jdbcClient.sql(
                """
                INSERT INTO submission (
                    id,
                    assignment_id,
                    student_user_id,
                    lesson_id,
                    content,
                    score,
                    errors_count,
                    submitted_at,
                    created_at,
                    updated_at
                ) VALUES (
                    :id,
                    :assignmentId,
                    :userId,
                    :lessonId,
                    :content,
                    :score,
                    :errorsCount,
                    :submittedAt,
                    :createdAt,
                    :updatedAt
                )
                """.trimIndent(),
            )
                .param("id", id)
                .param("assignmentId", assignmentId)
                .param("userId", userId)
                .param("lessonId", lessonId)
                .param("content", content)
                .param("score", scoring?.score)
                .param("errorsCount", scoring?.errorsCount)
                .param("submittedAt", if (request.submitted) now.toMaterialOffsetDateTime() else null)
                .param("createdAt", now.toMaterialOffsetDateTime())
                .param("updatedAt", now.toMaterialOffsetDateTime())
                .update()
            id
        } else {
            jdbcClient.sql(
                """
                UPDATE submission
                   SET content = :content,
                       score = :score,
                       errors_count = :errorsCount,
                       submitted_at = CASE
                           WHEN :submitted = TRUE THEN :submittedAt
                           ELSE submitted_at
                       END,
                       updated_at = :updatedAt
                 WHERE id = :id
                """.trimIndent(),
            )
                .param("id", existing.id)
                .param("content", content)
                .param("score", scoring?.score)
                .param("errorsCount", scoring?.errorsCount)
                .param("submitted", request.submitted)
                .param("submittedAt", now.toMaterialOffsetDateTime())
                .param("updatedAt", now.toMaterialOffsetDateTime())
                .update()
            existing.id
        }

        return requireNotNull(findMaterialSubmission(submissionId)).toResponse(objectMapper)
    }

    @Transactional(readOnly = true)
    fun getAnnotationForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
    ): MaterialAnnotationResponse {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val annotation = findMaterialAnnotation(lessonId, materialId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material annotation not found.")
        return annotation.toResponse(objectMapper)
    }

    @Transactional
    fun saveAnnotationForScheduledLesson(
        authentication: JwtAuthenticationToken,
        lessonId: UUID,
        request: MaterialAnnotationRequest,
    ): MaterialAnnotationResponse {
        val lookup = accessibleScheduledMaterial(authentication, lessonId)
        val materialId = lookup.materialId ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        find(materialId)?.takeIf { it.status != "ARCHIVED" }
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        validateJsonSize("content", request.content, objectMapper, 1_000_000)

        val existing = findMaterialAnnotation(lessonId, materialId)
        val now = Instant.now()
        val content = objectMapper.writeValueAsString(request.content)
        val annotationId = if (existing == null) {
            val id = UUID.randomUUID()
            jdbcClient.sql(
                """
                INSERT INTO lesson_material_annotation (
                    id,
                    lesson_id,
                    material_id,
                    content,
                    created_at,
                    updated_at
                ) VALUES (
                    :id,
                    :lessonId,
                    :materialId,
                    :content,
                    :createdAt,
                    :updatedAt
                )
                """.trimIndent(),
            )
                .param("id", id)
                .param("lessonId", lessonId)
                .param("materialId", materialId)
                .param("content", content)
                .param("createdAt", now.toMaterialOffsetDateTime())
                .param("updatedAt", now.toMaterialOffsetDateTime())
                .update()
            id
        } else {
            jdbcClient.sql(
                """
                UPDATE lesson_material_annotation
                   SET content = :content,
                       updated_at = :updatedAt
                 WHERE id = :id
                """.trimIndent(),
            )
                .param("id", existing.id)
                .param("content", content)
                .param("updatedAt", now.toMaterialOffsetDateTime())
                .update()
            existing.id
        }

        return requireNotNull(findMaterialAnnotation(annotationId)).toResponse(objectMapper)
    }

    private fun scoreMaterialSubmission(material: StoredLessonMaterial, content: JsonNode): MaterialSubmissionScore? {
        val document = runCatching { objectMapper.readTree(material.document) }.getOrNull() ?: return null
        val answerRoot = content.get("answers")?.takeIf { node -> node.isObject } ?: return null
        val pages = document.get("pages") as? ArrayNode ?: return null
        var total = 0
        var correct = 0

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
                            val expected = item.get("answer")?.asText()?.takeIf { value -> value.isNotBlank() }
                                ?: return@forEachIndexed
                            val prompt = item.get("prompt")?.asText().orEmpty()
                            val key = "$prompt-$index"
                            val actual = answerItems?.get(key)?.asText()
                            total += 1
                            if (normalizedScoringAnswer(actual) == normalizedScoringAnswer(expected)) {
                                correct += 1
                            }
                        }
                    }
                    "matchingPairs" -> {
                        val matches = answerBlock?.get("matches")?.takeIf { node -> node.isObject }
                        val pairs = block.get("pairs") as? ArrayNode ?: return@forEach
                        pairs.forEach { pair ->
                            val expectedPairId = pair.get("id")?.asText()?.takeIf { value -> value.isNotBlank() }
                                ?: return@forEach
                            total += 1
                            if (matches?.get(expectedPairId)?.asText() == expectedPairId) {
                                correct += 1
                            }
                        }
                    }
                }
            }
        }

        if (total == 0) {
            return null
        }

        val maxScore = materialMaxScore(material.scoringRubric) ?: BigDecimal.TEN
        return MaterialSubmissionScore(
            score = maxScore
                .multiply(BigDecimal(correct))
                .divide(BigDecimal(total), 2, RoundingMode.HALF_UP),
            errorsCount = total - correct,
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
            ?: "Новый материал"
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
            ?: "Создай редактируемый материал Play&Say по внешней странице. Сохрани тему источника, но сделай упражнения интерактивными для живого онлайн-урока."
        val cefrLevel = request.cefrLevel?.trim()?.uppercase()?.takeIf { it in cefrLevels }
            ?: inferCefrLevel(importPrompt + "\n" + imported.text.take(500))
        val title = request.title.optionalClean("title", 160)
            ?: imported.title?.take(120)?.ifBlank { null }
            ?: "Материал из URL"
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
        val material = find(materialId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the material owner or admin can edit generated images.")
        }

        val blockId = request.blockId.optionalClean("blockId", 80)
        val maxImages = (request.maxImages ?: 12).coerceIn(1, 12)
        val document = objectMapper.readTree(material.document).deepCopy<ObjectNode>()
        val targets = matchingImageTargets(document, blockId, maxImages)
        if (targets.isEmpty()) {
            return material.toResponse(objectMapper)
        }

        targets.forEach { target ->
            val generated = materialImageGenerationService.generate(
                MaterialImageGenerationInput(
                    prompt = target.imagePrompt,
                    alt = target.imageAlt,
                ),
            )
            val assetId = insertGeneratedImageAsset(materialId, target, generated)
            target.pair.put("imageUrl", "material-asset:$assetId")
            target.pair.put("imageAlt", target.imageAlt)
        }

        jdbcClient.sql(
            """
            UPDATE lesson_material
               SET document = :document,
                   updated_at = :updatedAt
             WHERE id = :id
            """.trimIndent(),
        )
            .param("id", materialId)
            .param("document", objectMapper.writeValueAsString(document))
            .param("updatedAt", Instant.now().toMaterialOffsetDateTime())
            .update()

        return requireNotNull(find(materialId)).toResponse(objectMapper)
    }

    @Transactional
    fun listAssets(authentication: JwtAuthenticationToken, materialId: UUID): List<MaterialAssetResponse> {
        val material = find(materialId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val currentUserId = authentication.currentUserIdIfNeeded()
        val canRead = material.canRead(authentication, currentUserId) ||
            isActiveMaterialParticipant(materialId, authentication.token.subject, Instant.now())
        if (!canRead) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        }
        return jdbcClient.sql(
            """
            SELECT id,
                   material_id,
                   kind,
                   storage_key,
                   external_url,
                   provider,
                   metadata,
                   created_at
              FROM material_asset
             WHERE material_id = :materialId
             ORDER BY created_at DESC
            """.trimIndent(),
        )
            .param("materialId", materialId)
            .query(::mapMaterialAsset)
            .list()
            .map { asset -> asset.toResponse(objectMapper) }
    }

    @Transactional
    fun createAsset(
        authentication: JwtAuthenticationToken,
        materialId: UUID,
        request: MaterialAssetRequest,
    ): MaterialAssetResponse {
        val material = find(materialId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the material owner or admin can edit assets.")
        }

        val values = request.validated(objectMapper)
        val id = UUID.randomUUID()
        val now = Instant.now()
        jdbcClient.sql(
            """
            INSERT INTO material_asset (
                id,
                material_id,
                kind,
                storage_key,
                external_url,
                provider,
                metadata,
                created_at
            ) VALUES (
                :id,
                :materialId,
                :kind,
                :storageKey,
                :externalUrl,
                :provider,
                :metadata,
                :createdAt
            )
            """.trimIndent(),
        )
            .param("id", id)
            .param("materialId", materialId)
            .param("kind", values.kind)
            .param("storageKey", values.storageKey)
            .param("externalUrl", values.externalUrl)
            .param("provider", values.provider)
            .param("metadata", objectMapper.writeValueAsString(values.metadata))
            .param("createdAt", now.toMaterialOffsetDateTime())
            .update()

        return requireNotNull(findAsset(id)).toResponse(objectMapper)
    }

    @Transactional
    fun deleteAsset(authentication: JwtAuthenticationToken, materialId: UUID, assetId: UUID) {
        val material = find(materialId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        val currentUserId = authentication.currentUserIdIfNeeded()
        if (!material.canEdit(authentication, currentUserId)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the material owner or admin can edit assets.")
        }

        val deleted = jdbcClient.sql(
            """
            DELETE FROM material_asset
             WHERE id = :assetId
               AND material_id = :materialId
            """.trimIndent(),
        )
            .param("assetId", assetId)
            .param("materialId", materialId)
            .update()

        if (deleted == 0) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material asset not found.")
        }
    }

    private fun insertGeneratedImageAsset(
        materialId: UUID,
        target: MatchingImageTarget,
        generated: GeneratedMaterialImage,
    ): UUID {
        val id = UUID.randomUUID()
        jdbcClient.sql(
            """
            INSERT INTO material_asset (
                id,
                material_id,
                kind,
                storage_key,
                external_url,
                provider,
                metadata,
                created_at
            ) VALUES (
                :id,
                :materialId,
                'GENERATED_IMAGE',
                :storageKey,
                :externalUrl,
                'AI',
                :metadata,
                :createdAt
            )
            """.trimIndent(),
        )
            .param("id", id)
            .param("materialId", materialId)
            .param("storageKey", "material-assets/$materialId/$id.jpg")
            .param("externalUrl", generated.dataUrl)
            .param("metadata", objectMapper.writeValueAsString(generatedImageMetadata(target, generated)))
            .param("createdAt", Instant.now().toMaterialOffsetDateTime())
            .update()
        return id
    }

    private fun generatedImageMetadata(target: MatchingImageTarget, generated: GeneratedMaterialImage): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("blockId", target.blockId)
            put("pairId", target.pairId)
            put("left", target.left)
            put("right", target.right)
            put("imageAlt", target.imageAlt)
            put("prompt", generated.prompt)
            put("model", generated.model)
            put("mimeType", generated.mimeType)
            generated.revisedPrompt?.let { value -> put("revisedPrompt", value) }
        }

    private fun find(materialId: UUID): StoredLessonMaterial? =
        jdbcClient.sql(materialSelect("WHERE m.id = :materialId"))
            .param("materialId", materialId)
            .query(::mapMaterial)
            .optional()
            .orElse(null)

    private fun findAsset(assetId: UUID): StoredMaterialAsset? =
        jdbcClient.sql(
            """
            SELECT id,
                   material_id,
                   kind,
                   storage_key,
                   external_url,
                   provider,
                   metadata,
                   created_at
              FROM material_asset
             WHERE id = :assetId
            """.trimIndent(),
        )
            .param("assetId", assetId)
            .query(::mapMaterialAsset)
            .optional()
            .orElse(null)

    private fun accessibleScheduledMaterial(authentication: JwtAuthenticationToken, lessonId: UUID): ScheduledMaterialLookup {
        val lookup = scheduledMaterialLookup(lessonId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled lesson not found.")

        if (!authentication.canManageMaterials() && !lookup.isVisibleToParticipant(Instant.now())) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled lesson not found.")
        }

        if (!authentication.canManageMaterials() && !isLessonParticipant(lessonId, authentication.token.subject)) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled lesson not found.")
        }

        if (lookup.materialId == null) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Material not found.")
        }
        return lookup
    }

    private fun scheduledMaterialLookup(lessonId: UUID): ScheduledMaterialLookup? =
        jdbcClient.sql(
            """
            SELECT l.id,
                   l.status,
                   l.scheduled_end,
                   COALESCE(l.material_id, lt.material_id) AS material_id
              FROM lesson l
              LEFT JOIN lesson_template lt ON lt.id = l.lesson_template_id
             WHERE l.id = :lessonId
            """.trimIndent(),
        )
            .param("lessonId", lessonId)
            .query { rs, _ ->
                ScheduledMaterialLookup(
                    id = rs.getObject("id", UUID::class.java),
                    status = rs.getString("status"),
                    scheduledEnd = rs.getObject("scheduled_end", OffsetDateTime::class.java)?.toInstant(),
                    materialId = rs.getObject("material_id", UUID::class.java),
                )
            }
            .optional()
            .orElse(null)

    private fun findOrCreateMaterialSubmissionAssignment(lessonId: UUID, material: StoredLessonMaterial): UUID =
        findMaterialSubmissionAssignment(lessonId, material.id) ?: run {
            val id = UUID.randomUUID()
            val now = Instant.now()
            jdbcClient.sql(
                """
                INSERT INTO assignment (
                    id,
                    lesson_id,
                    title,
                    instructions,
                    type,
                    payload,
                    max_score,
                    material_id,
                    created_at,
                    updated_at
                ) VALUES (
                    :id,
                    :lessonId,
                    :title,
                    :instructions,
                    'MATERIAL_WORK',
                    :payload,
                    :maxScore,
                    :materialId,
                    :createdAt,
                    :updatedAt
                )
                """.trimIndent(),
            )
                .param("id", id)
                .param("lessonId", lessonId)
                .param("title", material.title)
                .param("instructions", "Play&Say material answer snapshot")
                .param("payload", objectMapper.writeValueAsString(objectMapper.createObjectNode().put("source", "material")))
                .param("maxScore", materialMaxScore(material.scoringRubric))
                .param("materialId", material.id)
                .param("createdAt", now.toMaterialOffsetDateTime())
                .param("updatedAt", now.toMaterialOffsetDateTime())
                .update()
            id
        }

    private fun findMaterialSubmissionAssignment(lessonId: UUID, materialId: UUID): UUID? =
        jdbcClient.sql(
            """
            SELECT id
              FROM assignment
             WHERE lesson_id = :lessonId
               AND material_id = :materialId
               AND material_block_id IS NULL
               AND type = 'MATERIAL_WORK'
             ORDER BY created_at
             LIMIT 1
            """.trimIndent(),
        )
            .param("lessonId", lessonId)
            .param("materialId", materialId)
            .query(UUID::class.java)
            .optional()
            .orElse(null)

    private fun findMaterialSubmission(assignmentId: UUID, lessonId: UUID, userId: UUID): StoredMaterialSubmission? =
        jdbcClient.sql(
            """
            SELECT s.id,
                   s.assignment_id,
                   s.lesson_id,
                   a.material_id,
                   s.student_user_id,
                   student.keycloak_subject AS user_subject,
                   COALESCE(student.display_name, student.name, student.username, student.keycloak_subject) AS user_name,
                   s.content,
                   s.score,
                   s.errors_count,
                   s.submitted_at,
                   s.created_at,
                   s.updated_at
              FROM submission s
              JOIN assignment a ON a.id = s.assignment_id
              JOIN app_user student ON student.id = s.student_user_id
             WHERE s.assignment_id = :assignmentId
               AND s.lesson_id = :lessonId
               AND s.student_user_id = :userId
             ORDER BY s.updated_at DESC
             LIMIT 1
            """.trimIndent(),
        )
            .param("assignmentId", assignmentId)
            .param("lessonId", lessonId)
            .param("userId", userId)
            .query(::mapMaterialSubmission)
            .optional()
            .orElse(null)

    private fun findMaterialSubmission(submissionId: UUID): StoredMaterialSubmission? =
        jdbcClient.sql(
            """
            SELECT s.id,
                   s.assignment_id,
                   s.lesson_id,
                   a.material_id,
                   s.student_user_id,
                   student.keycloak_subject AS user_subject,
                   COALESCE(student.display_name, student.name, student.username, student.keycloak_subject) AS user_name,
                   s.content,
                   s.score,
                   s.errors_count,
                   s.submitted_at,
                   s.created_at,
                   s.updated_at
              FROM submission s
              JOIN assignment a ON a.id = s.assignment_id
              JOIN app_user student ON student.id = s.student_user_id
             WHERE s.id = :submissionId
            """.trimIndent(),
        )
            .param("submissionId", submissionId)
            .query(::mapMaterialSubmission)
            .optional()
            .orElse(null)

    private fun findMaterialAnnotation(lessonId: UUID, materialId: UUID): StoredMaterialAnnotation? =
        jdbcClient.sql(
            """
            SELECT id,
                   lesson_id,
                   material_id,
                   content,
                   created_at,
                   updated_at
              FROM lesson_material_annotation
             WHERE lesson_id = :lessonId
               AND material_id = :materialId
            """.trimIndent(),
        )
            .param("lessonId", lessonId)
            .param("materialId", materialId)
            .query(::mapMaterialAnnotation)
            .optional()
            .orElse(null)

    private fun findMaterialAnnotation(annotationId: UUID): StoredMaterialAnnotation? =
        jdbcClient.sql(
            """
            SELECT id,
                   lesson_id,
                   material_id,
                   content,
                   created_at,
                   updated_at
              FROM lesson_material_annotation
             WHERE id = :annotationId
            """.trimIndent(),
        )
            .param("annotationId", annotationId)
            .query(::mapMaterialAnnotation)
            .optional()
            .orElse(null)

    private fun isLessonParticipant(lessonId: UUID, subject: String): Boolean =
        jdbcClient.sql(
            """
            SELECT COUNT(*)
              FROM lesson_participant lp
              JOIN app_user student ON student.id = lp.student_user_id
             WHERE lp.lesson_id = :lessonId
               AND student.keycloak_subject = :subject
            """.trimIndent(),
        )
            .param("lessonId", lessonId)
            .param("subject", subject)
            .query(Int::class.java)
            .single() > 0

    private fun isActiveMaterialParticipant(materialId: UUID, subject: String, now: Instant): Boolean =
        jdbcClient.sql(
            """
            SELECT COUNT(*)
              FROM lesson l
              LEFT JOIN lesson_template lt ON lt.id = l.lesson_template_id
              JOIN lesson_participant lp ON lp.lesson_id = l.id
              JOIN app_user student ON student.id = lp.student_user_id
             WHERE COALESCE(l.material_id, lt.material_id) = :materialId
               AND student.keycloak_subject = :subject
               AND l.status NOT IN ('COMPLETED', 'CANCELLED')
               AND (l.scheduled_end IS NULL OR l.scheduled_end > :now)
            """.trimIndent(),
        )
            .param("materialId", materialId)
            .param("subject", subject)
            .param("now", now.toMaterialOffsetDateTime())
            .query(Int::class.java)
            .single() > 0

    private fun JwtAuthenticationToken.currentUserIdIfNeeded(): UUID? =
        if (canManageMaterials()) userProfileStore.currentUserId(this) else null

    private fun materialSelect(whereClause: String): String =
        """
        SELECT m.id,
               m.owner_teacher_user_id,
               owner.keycloak_subject AS owner_teacher_subject,
               COALESCE(owner.display_name, owner.name, owner.username) AS owner_teacher_name,
               m.title,
               m.description,
               m.language,
               m.cefr_level,
               m.visibility,
               m.status,
               m.document,
               m.source_meta,
               m.scoring_rubric,
               m.created_at,
               m.updated_at
          FROM lesson_material m
          LEFT JOIN app_user owner ON owner.id = m.owner_teacher_user_id
          $whereClause
        """.trimIndent()
}

private data class MatchingImageTarget(
    val blockId: String,
    val pairId: String,
    val left: String,
    val right: String,
    val imagePrompt: String,
    val imageAlt: String,
    val pair: ObjectNode,
)

private data class MaterialSubmissionScore(
    val score: BigDecimal,
    val errorsCount: Int,
)

@RestController
@Tag(name = "Materials")
class MaterialController(
    private val store: LessonMaterialStore,
) {
    @GetMapping("/materials", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listMaterials",
        summary = "List lesson materials",
        description = "Teachers/admins see their materials and published public materials. Students see published public materials.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Lesson materials"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
        ],
    )
    fun list(authentication: JwtAuthenticationToken): List<LessonMaterialResponse> =
        store.list(authentication)

    @GetMapping("/materials/{materialId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getMaterial",
        summary = "Get lesson material",
        description = "Returns a visible lesson material.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Lesson material"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
        ],
    )
    fun get(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
    ): LessonMaterialResponse =
        store.get(authentication, materialId)

    @PostMapping(
        "/materials",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createMaterial",
        summary = "Create lesson material",
        description = "Creates a structured lesson material. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "201", description = "Lesson material created"),
            ApiResponse(responseCode = "400", description = "Invalid material payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage materials", content = [Content()]),
        ],
    )
    fun create(
        authentication: JwtAuthenticationToken,
        @RequestBody request: LessonMaterialRequest,
    ): ResponseEntity<LessonMaterialResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(store.create(authentication, request))

    @PutMapping(
        "/materials/{materialId}",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "updateMaterial",
        summary = "Update lesson material",
        description = "Updates a structured lesson material. Requires material owner or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Lesson material updated"),
            ApiResponse(responseCode = "400", description = "Invalid material payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot edit material", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
        ],
    )
    fun update(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @RequestBody request: LessonMaterialRequest,
    ): LessonMaterialResponse =
        store.update(authentication, materialId, request)

    @DeleteMapping("/materials/{materialId}")
    @Operation(
        operationId = "archiveMaterial",
        summary = "Archive lesson material",
        description = "Archives a lesson material. Requires material owner or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "204", description = "Lesson material archived"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot archive material", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
        ],
    )
    fun archive(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
    ): ResponseEntity<Void> {
        store.archive(authentication, materialId)
        return ResponseEntity.noContent().build()
    }

    @GetMapping("/schedule/lessons/{lessonId}/material", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getScheduledLessonMaterial",
        summary = "Get scheduled lesson material",
        description = "Returns the material attached directly to a scheduled lesson or inherited from its lesson template.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Scheduled lesson material"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
        ],
    )
    fun scheduledLessonMaterial(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): LessonMaterialResponse =
        store.getForScheduledLesson(authentication, lessonId)

    @GetMapping("/schedule/lessons/{lessonId}/material-submission", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getScheduledLessonMaterialSubmission",
        summary = "Get current material answer snapshot",
        description = "Returns the current user's saved answers for the material attached to a scheduled lesson.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material submission"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Submission, lesson, or material not found", content = [Content()]),
        ],
    )
    fun scheduledLessonMaterialSubmission(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): MaterialSubmissionResponse =
        store.getSubmissionForScheduledLesson(authentication, lessonId)

    @GetMapping("/schedule/lessons/{lessonId}/material-submissions", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listScheduledLessonMaterialSubmissions",
        summary = "List material answer snapshots for scheduled lesson",
        description = "Returns saved student answers for the material attached to a scheduled lesson. Requires TEACHER or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material submissions"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot monitor submissions", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
        ],
    )
    fun scheduledLessonMaterialSubmissions(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): List<MaterialSubmissionResponse> =
        store.listSubmissionsForScheduledLesson(authentication, lessonId)

    @GetMapping("/schedule/lessons/{lessonId}/material-annotation", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "getScheduledLessonMaterialAnnotation",
        summary = "Get shared material annotation layer",
        description = "Returns the shared drawing layer for the material attached to a scheduled lesson.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material annotation"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Annotation, scheduled lesson, or material not found", content = [Content()]),
        ],
    )
    fun scheduledLessonMaterialAnnotation(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
    ): MaterialAnnotationResponse =
        store.getAnnotationForScheduledLesson(authentication, lessonId)

    @PutMapping(
        "/schedule/lessons/{lessonId}/material-annotation",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "saveScheduledLessonMaterialAnnotation",
        summary = "Save shared material annotation layer",
        description = "Creates or updates the shared drawing layer for the material attached to a scheduled lesson.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material annotation saved"),
            ApiResponse(responseCode = "400", description = "Invalid annotation payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
        ],
    )
    fun saveScheduledLessonMaterialAnnotation(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestBody request: MaterialAnnotationRequest,
    ): MaterialAnnotationResponse =
        store.saveAnnotationForScheduledLesson(authentication, lessonId, request)

    @PutMapping(
        "/schedule/lessons/{lessonId}/material-submission",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "saveScheduledLessonMaterialSubmission",
        summary = "Save current material answer snapshot",
        description = "Creates or updates the current user's answers for the material attached to a scheduled lesson.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Material submission saved"),
            ApiResponse(responseCode = "400", description = "Invalid submission payload", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Scheduled lesson or material not found", content = [Content()]),
        ],
    )
    fun saveScheduledLessonMaterialSubmission(
        authentication: JwtAuthenticationToken,
        @PathVariable lessonId: UUID,
        @RequestBody request: MaterialSubmissionRequest,
    ): MaterialSubmissionResponse =
        store.saveSubmissionForScheduledLesson(authentication, lessonId, request)

    @PostMapping(
        "/materials/ai-draft",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "draftMaterialWithAi",
        summary = "Draft lesson material with AI",
        description = "Returns a structured Play&Say material draft from a text prompt and optional worksheet image scan/photo. Uses the configured AI provider, or deterministic stub when AI is disabled.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Draft material"),
            ApiResponse(responseCode = "400", description = "Invalid draft prompt", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage materials", content = [Content()]),
        ],
    )
    fun draft(
        authentication: JwtAuthenticationToken,
        @RequestBody request: MaterialAiDraftRequest,
    ): LessonMaterialDraftResponse =
        store.draft(authentication, request)

    @PostMapping(
        "/materials/import-url",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "draftMaterialFromUrl",
        summary = "Draft lesson material from external URL",
        description = "Fetches readable text from an http/https page, then returns a structured Play&Say draft through the configured AI provider. Local/private hosts are rejected.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Draft material"),
            ApiResponse(responseCode = "400", description = "Invalid or unreadable external URL", content = [Content()]),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot manage materials", content = [Content()]),
            ApiResponse(responseCode = "502", description = "External URL or AI provider failed", content = [Content()]),
        ],
    )
    fun draftFromUrl(
        authentication: JwtAuthenticationToken,
        @RequestBody request: MaterialUrlImportRequest,
    ): LessonMaterialDraftResponse =
        store.draftFromUrl(authentication, request)

    @PostMapping(
        "/materials/{materialId}/generate-images",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "generateMaterialImages",
        summary = "Generate missing material images",
        description = "Generates new AI illustrations for matching-pairs material blocks and updates the material document. Requires material owner or ADMIN role.",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    @ApiResponses(
        value = [
            ApiResponse(responseCode = "200", description = "Lesson material with generated images"),
            ApiResponse(responseCode = "401", description = "Missing or invalid bearer token", content = [Content()]),
            ApiResponse(responseCode = "403", description = "Current user cannot edit material", content = [Content()]),
            ApiResponse(responseCode = "404", description = "Material not found", content = [Content()]),
        ],
    )
    fun generateImages(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @RequestBody request: MaterialGenerateImagesRequest,
    ): LessonMaterialResponse =
        store.generateImages(authentication, materialId, request)

    @GetMapping("/materials/{materialId}/assets", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(
        operationId = "listMaterialAssets",
        summary = "List material assets",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun listAssets(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
    ): List<MaterialAssetResponse> =
        store.listAssets(authentication, materialId)

    @PostMapping(
        "/materials/{materialId}/assets",
        consumes = [MediaType.APPLICATION_JSON_VALUE],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        operationId = "createMaterialAsset",
        summary = "Create material asset reference",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun createAsset(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @RequestBody request: MaterialAssetRequest,
    ): ResponseEntity<MaterialAssetResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(store.createAsset(authentication, materialId, request))

    @DeleteMapping("/materials/{materialId}/assets/{assetId}")
    @Operation(
        operationId = "deleteMaterialAsset",
        summary = "Delete material asset reference",
        security = [SecurityRequirement(name = "bearerAuth")],
    )
    fun deleteAsset(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @PathVariable assetId: UUID,
    ): ResponseEntity<Void> {
        store.deleteAsset(authentication, materialId, assetId)
        return ResponseEntity.noContent().build()
    }
}

private data class ScheduledMaterialLookup(
    val id: UUID,
    val status: String,
    val scheduledEnd: Instant?,
    val materialId: UUID?,
) {
    fun isVisibleToParticipant(now: Instant): Boolean =
        status !in setOf("COMPLETED", "CANCELLED") && scheduledEnd?.isAfter(now) != false
}

private fun LessonMaterialRequest.validated(objectMapper: ObjectMapper): ValidatedLessonMaterialRequest {
    val title = title.requiredClean("title", 160)
    val language = language.requiredClean("language", 16)
    val cefrLevel = cefrLevel.trim().uppercase()
    if (cefrLevel !in cefrLevels) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported CEFR level.")
    }
    val visibility = visibility.trim().uppercase()
    if (visibility !in materialVisibilities) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported material visibility.")
    }
    val status = status.trim().uppercase()
    if (status !in materialStatuses) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported material status.")
    }

    val document = document ?: defaultMaterialDocument(title, objectMapper)
    val sourceMeta = sourceMeta ?: objectMapper.createObjectNode().put("kind", "MANUAL")
    val scoringRubric = scoringRubric ?: defaultScoringRubric(objectMapper)

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

private fun MaterialAssetRequest.validated(objectMapper: ObjectMapper): ValidatedMaterialAssetRequest {
    val kind = kind.trim().uppercase()
    if (kind !in assetKinds) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported material asset kind.")
    }
    val provider = provider.trim().uppercase()
    if (provider !in assetProviders) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported material asset provider.")
    }
    val storageKey = storageKey.optionalClean("storageKey", 1_024)
    val externalUrl = externalUrl.optionalClean("externalUrl", 4_000)
    if (storageKey == null && externalUrl == null) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "storageKey or externalUrl is required.")
    }
    val metadata = metadata ?: objectMapper.createObjectNode()
    validateJsonSize("metadata", metadata, objectMapper, 40_000)

    return ValidatedMaterialAssetRequest(
        kind = kind,
        storageKey = storageKey,
        externalUrl = externalUrl,
        provider = provider,
        metadata = metadata,
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
        provider = provider,
        metadata = objectMapper.readTree(metadata),
        createdAt = createdAt,
    )

private fun StoredMaterialSubmission.toResponse(objectMapper: ObjectMapper): MaterialSubmissionResponse =
    MaterialSubmissionResponse(
        id = id,
        assignmentId = assignmentId,
        lessonId = lessonId,
        materialId = materialId,
        userId = userId,
        userSubject = userSubject,
        userName = userName,
        content = objectMapper.readTree(content),
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

private fun matchingImageTargets(document: ObjectNode, blockId: String?, maxImages: Int): List<MatchingImageTarget> {
    val pages = document.get("pages") as? ArrayNode ?: return emptyList()
    val targets = mutableListOf<MatchingImageTarget>()
    pages.forEach { page ->
        val blocks = page.get("blocks") as? ArrayNode ?: return@forEach
        blocks.forEach { block ->
            val blockObject = block as? ObjectNode ?: return@forEach
            if (blockObject.get("type")?.asText() != "matchingPairs") {
                return@forEach
            }
            val currentBlockId = blockObject.get("id")?.asText()?.takeIf { value -> value.isNotBlank() } ?: "matchingPairs"
            if (blockId != null && currentBlockId != blockId) {
                return@forEach
            }
            val pairs = blockObject.get("pairs") as? ArrayNode ?: return@forEach
            pairs.forEach { pair ->
                if (targets.size >= maxImages) {
                    return@forEach
                }
                val pairObject = pair as? ObjectNode ?: return@forEach
                val imageUrl = pairObject.get("imageUrl")?.asText()?.trim().orEmpty()
                if (imageUrl.isNotEmpty()) {
                    return@forEach
                }
                val left = pairObject.get("left")?.asText()?.trim().orEmpty()
                val right = pairObject.get("right")?.asText()?.trim().orEmpty()
                if (left.isEmpty() || right.isEmpty()) {
                    return@forEach
                }
                val pairId = pairObject.get("id")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                    ?: "pair-${targets.size + 1}"
                val imageAlt = pairObject.get("imageAlt")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                    ?: right
                val imagePrompt = pairObject.get("imagePrompt")?.asText()?.trim()?.takeIf { value -> value.isNotEmpty() }
                    ?: "child-friendly workbook illustration of $imageAlt, white background"
                targets.add(
                    MatchingImageTarget(
                        blockId = currentBlockId,
                        pairId = pairId,
                        left = left,
                        right = right,
                        imagePrompt = imagePrompt,
                        imageAlt = imageAlt,
                        pair = pairObject,
                    ),
                )
            }
        }
    }
    return targets
}

private fun mapMaterial(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): StoredLessonMaterial =
    StoredLessonMaterial(
        id = rs.getObject("id", UUID::class.java),
        ownerTeacherUserId = rs.getObject("owner_teacher_user_id", UUID::class.java),
        ownerTeacherSubject = rs.getString("owner_teacher_subject"),
        ownerTeacherName = rs.getString("owner_teacher_name"),
        title = rs.getString("title"),
        description = rs.getString("description"),
        language = rs.getString("language"),
        cefrLevel = rs.getString("cefr_level"),
        visibility = rs.getString("visibility"),
        status = rs.getString("status"),
        document = rs.getString("document"),
        sourceMeta = rs.getString("source_meta"),
        scoringRubric = rs.getString("scoring_rubric"),
        createdAt = rs.getMaterialInstant("created_at"),
        updatedAt = rs.getMaterialInstant("updated_at"),
    )

private fun mapMaterialAsset(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): StoredMaterialAsset =
    StoredMaterialAsset(
        id = rs.getObject("id", UUID::class.java),
        materialId = rs.getObject("material_id", UUID::class.java),
        kind = rs.getString("kind"),
        storageKey = rs.getString("storage_key"),
        externalUrl = rs.getString("external_url"),
        provider = rs.getString("provider"),
        metadata = rs.getString("metadata"),
        createdAt = rs.getMaterialInstant("created_at"),
    )

private fun mapMaterialSubmission(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): StoredMaterialSubmission =
    StoredMaterialSubmission(
        id = rs.getObject("id", UUID::class.java),
        assignmentId = rs.getObject("assignment_id", UUID::class.java),
        lessonId = rs.getObject("lesson_id", UUID::class.java),
        materialId = rs.getObject("material_id", UUID::class.java),
        userId = rs.getObject("student_user_id", UUID::class.java),
        userSubject = rs.getString("user_subject"),
        userName = rs.getString("user_name"),
        content = rs.getString("content"),
        score = rs.getBigDecimal("score"),
        errorsCount = rs.getNullableMaterialInt("errors_count"),
        submittedAt = rs.getObject("submitted_at", OffsetDateTime::class.java)?.toInstant(),
        createdAt = rs.getMaterialInstant("created_at"),
        updatedAt = rs.getMaterialInstant("updated_at"),
    )

private fun mapMaterialAnnotation(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): StoredMaterialAnnotation =
    StoredMaterialAnnotation(
        id = rs.getObject("id", UUID::class.java),
        lessonId = rs.getObject("lesson_id", UUID::class.java),
        materialId = rs.getObject("material_id", UUID::class.java),
        content = rs.getString("content"),
        createdAt = rs.getMaterialInstant("created_at"),
        updatedAt = rs.getMaterialInstant("updated_at"),
    )

private fun JwtAuthenticationToken.requireMaterialManager() {
    if (!canManageMaterials()) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "TEACHER or ADMIN role is required.")
    }
}

private fun JwtAuthenticationToken.canManageMaterials(): Boolean =
    authorities.any { authority -> authority.authority == "ROLE_TEACHER" || authority.authority == "ROLE_ADMIN" }

private fun JwtAuthenticationToken.isMaterialAdmin(): Boolean =
    authorities.any { authority -> authority.authority == "ROLE_ADMIN" }

private fun defaultMaterialDocument(title: String, objectMapper: ObjectMapper): ObjectNode =
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
                        put("title", "Новый блок")
                        put("body", "Добавьте текст, видео, карточки или задание.")
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
): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("schemaVersion", 1)
        putArray("pages").add(
            objectMapper.createObjectNode().apply {
                put("id", "page-warmup")
                put("title", title)
                put("layout", "FLOW")
                val blocks = putArray("blocks")
                blocks.add(textBlock(objectMapper, "block-goal", "Цель урока", prompt))
                blocks.add(
                    objectMapper.createObjectNode().apply {
                        put("id", "block-vocab")
                        put("type", "flashcards")
                        put("title", "Useful words")
                        putArray("cards")
                            .add(flashcard(objectMapper, "topic", "topic", "тема", "Let's discuss this topic."))
                            .add(flashcard(objectMapper, "opinion", "opinion", "мнение", "I think it is useful."))
                            .add(flashcard(objectMapper, "because", "because", "потому что", "I agree because..."))
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

private fun defaultScoringRubric(objectMapper: ObjectMapper): ObjectNode =
    objectMapper.createObjectNode().apply {
        put("maxScore", 10)
        putArray("criteria")
            .add(criteria(objectMapper, "taskCompletion", "Выполнение задания", 4))
            .add(criteria(objectMapper, "grammar", "Грамматика", 2))
            .add(criteria(objectMapper, "vocabulary", "Лексика", 2))
            .add(criteria(objectMapper, "fluency", "Беглость/самостоятельность", 2))
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
        ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$fieldName is required.")

private fun String?.optionalClean(fieldName: String, maxLength: Int): String? {
    val cleaned = this?.trim()?.takeIf { it.isNotEmpty() }
    if (cleaned != null && cleaned.length > maxLength) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$fieldName must be at most $maxLength characters.")
    }
    return cleaned
}

private fun String?.validatedImageDataUrl(fieldName: String): String? {
    val cleaned = optionalClean(fieldName, materialAiSourceImageDataUrlMaxLength) ?: return null
    val prefix = materialAiImageDataUrlPrefixes.firstOrNull { prefix -> cleaned.startsWith(prefix) }
        ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$fieldName must be a JPEG, PNG, or WebP data URL.")
    val encoded = cleaned.removePrefix(prefix)
    if (encoded.isBlank()) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$fieldName is empty.")
    }
    runCatching { Base64.getDecoder().decode(encoded) }
        .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$fieldName must contain valid base64 image data.") }
    return cleaned
}

private fun validateJsonSize(fieldName: String, value: JsonNode, objectMapper: ObjectMapper, maxBytes: Int) {
    val byteSize = objectMapper.writeValueAsBytes(value).size
    if (byteSize > maxBytes) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$fieldName must be at most $maxBytes bytes.")
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

private fun ResultSet.getMaterialInstant(columnName: String): Instant =
    getObject(columnName, OffsetDateTime::class.java).toInstant()

private fun ResultSet.getNullableMaterialInt(columnName: String): Int? {
    val value = getInt(columnName)
    return if (wasNull()) null else value
}

private fun Instant.toMaterialOffsetDateTime(): OffsetDateTime =
    atOffset(ZoneOffset.UTC)

private val cefrLevels = setOf("A1", "A2", "B1", "B2", "C1", "C2")
private val materialStatuses = setOf("DRAFT", "PUBLISHED", "ARCHIVED")
private val materialVisibilities = setOf("PRIVATE", "PUBLIC")
private val assetKinds = setOf("IMAGE", "GENERATED_IMAGE", "DOCUMENT_SCAN", "VIDEO_EMBED", "EXTERNAL_SOURCE", "AUDIO_NOTE")
private val assetProviders = setOf("YOUTUBE", "VK", "RUTUBE", "URL", "UPLOAD", "AI")
private val materialAiImageDataUrlPrefixes = listOf(
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,",
)
