package com.playsay.gateway.dto

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import java.math.BigDecimal
import java.math.RoundingMode
import java.sql.ResultSet
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
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

data class MaterialAssetResponse(
    val id: UUID,
    val materialId: UUID,
    val kind: String,
    val storageKey: String?,
    val externalUrl: String?,
    val contentUrl: String?,
    val provider: String,
    val metadata: JsonNode,
    val createdAt: Instant,
)

data class MaterialAssetUpdateRequest(
    @field:ArraySchema(maxItems = 16, schema = Schema(maxLength = 40), arraySchema = Schema(nullable = true))
    val tags: List<String>? = null,
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
    @field:Schema(nullable = true)
    val regenerate: Boolean? = null,
)

data class MaterialAnswerSuggestionsRequest(
    @field:Schema(maxLength = 80)
    val blockId: String,
    @field:ArraySchema(maxItems = 40, schema = Schema(maxLength = 120))
    val itemIds: List<String> = emptyList(),
)

data class MaterialAnswerSuggestionsResponse(
    val materialId: UUID,
    val blockId: String,
    val items: List<MaterialAnswerSuggestionItem>,
)

data class MaterialAnswerSuggestionItem(
    val itemId: String,
    val prompt: String,
    val answer: String?,
    val suggestions: List<MaterialAnswerSuggestion>,
)

data class MaterialAnswerSuggestion(
    val value: String,
    val reason: String,
    val confidence: BigDecimal,
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
