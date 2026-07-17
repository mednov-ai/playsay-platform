package com.playsay.gateway.dto

import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Schema
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

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
    val topicTags: List<String> = emptyList(),
    val skillTags: List<String> = emptyList(),
    @field:Schema(maxLength = 32, nullable = true)
    val ageBand: String? = null,
    @field:Schema(nullable = true)
    val estimatedDurationMin: Int? = null,
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
    val topicTags: List<String>,
    val skillTags: List<String>,
    val ageBand: String?,
    val estimatedDurationMin: Int?,
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

data class MaterialImagePageResponse(
    val material: LessonMaterialResponse,
    val activePageId: String,
)

data class LiveLessonImagePageResponse(
    val lesson: ScheduledLessonResponse,
    val material: LessonMaterialResponse,
    val activePageId: String,
)

data class LiveLessonHtmlGamePageResponse(
    val lesson: ScheduledLessonResponse,
    val material: LessonMaterialResponse,
    val activePageId: String,
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

data class MaterialVideoPlaybackRequest(
    @field:Schema(maxLength = 80)
    val blockId: String,
    @field:Schema(allowableValues = ["LOW", "MEDIUM", "HIGH"], nullable = true)
    val quality: String? = null,
)

data class MaterialVideoPlaybackResponse(
    val materialId: UUID,
    val blockId: String,
    val videoId: String?,
    val mode: String,
    val reason: String?,
    val embedUrl: String?,
    val relayUrl: String?,
    val sessionId: UUID?,
    val expiresAt: Instant?,
    val requestedQuality: String? = null,
    val selectedQuality: String? = null,
    val selectedHeight: Int? = null,
    val thumbnailUrl: String? = null,
    val thumbnailAssetId: UUID? = null,
    @field:Schema(allowableValues = ["MINIO_CACHE", "YOUTUBE_RELAY"], nullable = true)
    val deliverySource: String? = null,
    @field:Schema(
        allowableValues = ["PENDING", "IN_PROGRESS", "READY", "RETRY", "REJECTED", "MISS", "DISABLED"],
        nullable = true,
    )
    val cacheStatus: String? = null,
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
    val targetStudentSubject: String? = null,
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
