package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import java.util.Base64
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component

data class ValidatedLessonMaterialValues(
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
)

@Component
class MaterialRequestValidator(
    private val messageProvider: MessageProvider,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
    private val externalActivityResolver: MaterialExternalActivityResolver = MaterialExternalActivityResolver(),
) {
    fun validate(request: LessonMaterialRequest): ValidatedLessonMaterialValues {
        val title = requiredClean(request.title, "title", 160)
        val language = requiredClean(request.language, "language", 16)
        val cefrLevel = request.cefrLevel.trim().uppercase()
        if (cefrLevel !in cefrLevels) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_CEFR_LEVEL)
        }
        val visibility = request.visibility.trim().uppercase()
        if (visibility !in materialVisibilities) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_MATERIAL_VISIBILITY)
        }
        val status = request.status.trim().uppercase()
        if (status !in materialStatuses) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.UNSUPPORTED_MATERIAL_STATUS)
        }

        val document = (request.document ?: defaultMaterialDocument(title, objectMapper, messageProvider)).deepCopy<JsonNode>()
        val sourceMeta = request.sourceMeta ?: objectMapper.createObjectNode().put("kind", "MANUAL")
        val scoringRubric = request.scoringRubric ?: defaultScoringRubric(objectMapper, messageProvider)

        validateJsonSize("document", document, 6_000_000)
        normalizeExternalActivities(document)
        validateManualHtmlGameTitles(document)
        validateJsonSize("sourceMeta", sourceMeta, 40_000)
        validateJsonSize("scoringRubric", scoringRubric, 40_000)

        return ValidatedLessonMaterialValues(
            title = title,
            description = optionalClean(request.description, "description", 2_000),
            language = language,
            cefrLevel = cefrLevel,
            visibility = visibility,
            status = status,
            document = document,
            sourceMeta = sourceMeta,
            scoringRubric = scoringRubric,
            topicTags = cleanTags(request.topicTags, "topicTags", 16),
            skillTags = cleanTags(request.skillTags, "skillTags", 16),
            ageBand = optionalClean(request.ageBand, "ageBand", 32),
            estimatedDurationMin = cleanDuration(request.estimatedDurationMin, "estimatedDurationMin"),
        )
    }

    fun cleanTags(values: List<String>, fieldName: String, maxItems: Int): List<String> {
        if (values.size > maxItems) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, fieldName, maxItems)
        }
        val seen = linkedSetOf<String>()
        values.forEach { raw ->
            val normalized = raw.trim()
                .removePrefix("#")
                .lowercase()
                .replace(Regex("[^a-z0-9-]+"), "-")
                .replace(Regex("-+"), "-")
                .trim('-')
                .take(40)
            if (normalized.isNotEmpty()) {
                seen.add(normalized)
            }
        }
        return seen.toList()
    }

    fun cleanDuration(value: Int?, fieldName: String): Int? {
        if (value == null) {
            return null
        }
        if (value !in 1..480) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.PLANNED_DURATION_OUT_OF_RANGE)
        }
        return value
    }

    fun requiredClean(value: String?, fieldName: String, maxLength: Int): String =
        optionalClean(value, fieldName, maxLength)
            ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_REQUIRED, fieldName)

    fun optionalClean(value: String?, fieldName: String, maxLength: Int): String? {
        val cleaned = value?.trim()?.takeIf { it.isNotEmpty() }
        if (cleaned != null && cleaned.length > maxLength) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, fieldName, maxLength)
        }
        return cleaned
    }

    fun validatedImageDataUrl(value: String?, fieldName: String): String? {
        val cleaned = optionalClean(value, fieldName, materialAiSourceImageDataUrlMaxLength) ?: return null
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

    fun validateJsonSize(fieldName: String, value: JsonNode, maxBytes: Int) {
        val byteSize = objectMapper.writeValueAsBytes(value).size
        if (byteSize > maxBytes) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.JSON_FIELD_TOO_LARGE, fieldName, maxBytes)
        }
    }

    private fun validateManualHtmlGameTitles(document: JsonNode) {
        document.path("pages").forEach { page ->
            page.path("blocks").forEach { block ->
                if (block.path("type").asText() == "htmlGame" && block.path("gameTitleSource").asText() == "USER") {
                    val title = block.path("title").asText().trim()
                    if (!MaterialHtmlGameTitlePolicy.isEnglish(title)) {
                        throw ProjectResponseException.localized(
                            HttpStatus.BAD_REQUEST,
                            MetaData.ErrorCodes.MATERIAL_HTML_GAME_TITLE_NOT_ENGLISH,
                        )
                    }
                }
            }
        }
    }

    private fun normalizeExternalActivities(document: JsonNode) {
        document.path("pages").forEach { page ->
            page.path("blocks").forEach { block ->
                if (block.path("type").asText() == "externalActivity") {
                    val objectBlock = block as? ObjectNode
                        ?: throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.MATERIAL_EXTERNAL_ACTIVITY_URL_INVALID)
                    val resolved = externalActivityResolver.resolve(block.path("url").asText())
                    objectBlock.put("url", resolved.normalizedUrl)
                    objectBlock.put("provider", resolved.provider)
                    objectBlock.put("externalActivitySupportLevel", resolved.supportLevel)
                }
            }
        }
    }

    fun supportedCefrLevel(value: String?): String? =
        value?.trim()?.uppercase()?.takeIf { level -> level in cefrLevels }

    fun inferCefrLevel(prompt: String): String {
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
}

private const val materialAiSourceImageDataUrlMaxLength = 2_500_000
private val cefrLevels = setOf("A1", "A2", "B1", "B2", "C1", "C2")
private val materialStatuses = setOf("DRAFT", "PUBLISHED", "ARCHIVED")
private val materialVisibilities = setOf("PRIVATE", "PUBLIC")
private val materialAiImageDataUrlPrefixes = listOf(
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,",
)
