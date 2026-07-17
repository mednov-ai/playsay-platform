package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.utils.MetaData
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile

@Component
class MaterialAssetUploadService(
    private val materialAssetRepo: MaterialAssetRepo,
    private val materialObjectStorage: MaterialObjectStorage,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    fun validateImageFile(file: MultipartFile): ValidatedMaterialAssetFile {
        val contentType = normalizedMaterialAssetContentType(file.contentType)
            ?: throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_IMAGE_PAGE_UNSUPPORTED_TYPE,
            )
        if (contentType !in supportedMaterialImageContentTypes) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_IMAGE_PAGE_UNSUPPORTED_TYPE,
            )
        }
        if (file.size > materialImageMaxBytes) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_IMAGE_PAGE_TOO_LARGE,
                materialImageMaxMegabytes,
            )
        }
        val bytes = file.bytes
        if (bytes.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_EMPTY, "file")
        }
        if (contentType == "image/svg+xml" && !isSafeMaterialSvg(bytes)) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_IMAGE_PAGE_UNSAFE_SVG,
            )
        }
        return ValidatedMaterialAssetFile(
            originalFileName = cleanMaterialAssetFileName(file.originalFilename),
            contentType = contentType,
            bytes = bytes,
        )
    }

    fun validateHtmlGameFile(file: MultipartFile): ValidatedMaterialAssetFile {
        val contentType = normalizedMaterialAssetContentType(file.contentType)
        val fileName = cleanMaterialAssetFileName(file.originalFilename)
        if (contentType != "text/html" || fileName?.endsWith(".html", ignoreCase = true) != true) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_HTML_GAME_UNSUPPORTED_TYPE,
            )
        }
        if (file.size > materialHtmlGameMaxBytes) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_HTML_GAME_TOO_LARGE,
                materialHtmlGameMaxMegabytes,
            )
        }
        val bytes = file.bytes
        if (bytes.isEmpty()) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_EMPTY, "file")
        }
        val html = decodeStrictUtf8(bytes)
            ?: throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_HTML_GAME_INVALID_UTF8,
            )
        if (!materialHtmlDocumentPattern.containsMatchIn(html) || unsafeMaterialHtmlPatterns.any { it.containsMatchIn(html) }) {
            throw ProjectResponseException.localized(
                HttpStatus.BAD_REQUEST,
                MetaData.ErrorCodes.MATERIAL_HTML_GAME_UNSAFE,
            )
        }
        return ValidatedMaterialAssetFile(
            originalFileName = fileName,
            contentType = "text/html",
            bytes = bytes,
        )
    }

    fun insertUploadedImageAsset(
        materialId: UUID,
        originalFileName: String?,
        contentType: String,
        bytes: ByteArray,
    ): UUID {
        val id = UUID.randomUUID()
        val storageKey = "material-assets/$materialId/$id.${contentType.materialImageExtension()}"
        try {
            materialObjectStorage.putObject(storageKey, bytes, contentType)
            materialAssetRepo.saveAndFlush(
                MaterialAssetEntity(
                    id = id,
                    materialId = materialId,
                    kind = "UPLOADED_IMAGE",
                    storageKey = storageKey,
                    externalUrl = null,
                    provider = "USER",
                    metadata = objectMapper.writeValueAsString(
                        objectMapper.createObjectNode().apply {
                            originalFileName?.takeIf { it.isNotBlank() }?.let { put("fileName", it.take(240)) }
                            put("mimeType", contentType)
                            put("byteSize", bytes.size)
                            put("storageKey", storageKey)
                            put("safeSvg", contentType == "image/svg+xml")
                            replace("tags", objectMapper.createArrayNode())
                        },
                    ),
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

    fun insertHtmlGameAsset(
        materialId: UUID,
        originalFileName: String?,
        bytes: ByteArray,
    ): UUID {
        val id = UUID.randomUUID()
        val storageKey = "material-assets/$materialId/$id.html"
        try {
            materialObjectStorage.putObject(storageKey, bytes, "text/html")
            materialAssetRepo.saveAndFlush(
                MaterialAssetEntity(
                    id = id,
                    materialId = materialId,
                    kind = "HTML_GAME",
                    storageKey = storageKey,
                    externalUrl = null,
                    provider = "USER",
                    metadata = objectMapper.writeValueAsString(
                        objectMapper.createObjectNode().apply {
                            originalFileName?.let { put("fileName", it) }
                            put("mimeType", "text/html")
                            put("byteSize", bytes.size)
                            put("storageKey", storageKey)
                            put("selfContained", true)
                        },
                    ),
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
}

data class ValidatedMaterialAssetFile(
    val originalFileName: String?,
    val contentType: String,
    val bytes: ByteArray,
)

internal fun String.materialImageExtension(): String =
    when (lowercase()) {
        "image/jpeg", "image/jpg" -> "jpg"
        "image/png" -> "png"
        "image/webp" -> "webp"
        "image/svg+xml" -> "svg"
        else -> "bin"
    }

private const val materialImageMaxMegabytes = 12
private const val materialImageMaxBytes = materialImageMaxMegabytes * 1024 * 1024
private const val materialHtmlGameMaxMegabytes = 5
private const val materialHtmlGameMaxBytes = materialHtmlGameMaxMegabytes * 1024 * 1024
private val supportedMaterialImageContentTypes = setOf("image/jpeg", "image/png", "image/webp", "image/svg+xml")
private val materialHtmlDocumentPattern = Regex("""<\s*html\b""", RegexOption.IGNORE_CASE)
private val unsafeMaterialSvgPatterns = listOf(
    Regex("""<\s*script\b""", RegexOption.IGNORE_CASE),
    Regex("""<\s*foreignObject\b""", RegexOption.IGNORE_CASE),
    Regex("""\s+on[a-z]+\s*=""", RegexOption.IGNORE_CASE),
    Regex("""javascript\s*:""", RegexOption.IGNORE_CASE),
    Regex("""<\s*!\s*doctype\b""", RegexOption.IGNORE_CASE),
    Regex("""<\s*!\s*entity\b""", RegexOption.IGNORE_CASE),
    Regex("""<\?\s*xml-stylesheet\b""", RegexOption.IGNORE_CASE),
    Regex("""\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|//|data:)""", RegexOption.IGNORE_CASE),
)
private val unsafeMaterialHtmlPatterns = listOf(
    Regex("""<\s*(?:iframe|frame|object|embed|base)\b""", RegexOption.IGNORE_CASE),
    Regex("""<\s*meta\b[^>]*http-equiv\s*=\s*["']?refresh""", RegexOption.IGNORE_CASE),
    Regex("""<\s*script\b[^>]*\bsrc\s*=""", RegexOption.IGNORE_CASE),
    Regex("""<\s*link\b[^>]*\bhref\s*=""", RegexOption.IGNORE_CASE),
    Regex("""<\s*(?:img|audio|video|source)\b[^>]*\bsrc(?:set)?\s*=\s*["']\s*(?!data:|blob:)""", RegexOption.IGNORE_CASE),
    Regex("""<\s*(?:script|img|audio|video|source|link)\b[^>]*(?:src|href)\s*=\s*["']\s*(?:https?:)?//""", RegexOption.IGNORE_CASE),
    Regex("""@import\s+(?:url\s*\()?\s*["']?""", RegexOption.IGNORE_CASE),
    Regex("""url\s*\(\s*["']?\s*(?:https?:)?//""", RegexOption.IGNORE_CASE),
    Regex("""\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(""", RegexOption.IGNORE_CASE),
    Regex("""navigator\s*\.\s*sendBeacon\s*\(""", RegexOption.IGNORE_CASE),
)

private fun normalizedMaterialAssetContentType(value: String?): String? =
    value
        ?.substringBefore(';')
        ?.trim()
        ?.lowercase()
        ?.let { if (it == "image/jpg") "image/jpeg" else it }
        ?.takeIf { it.isNotEmpty() }

private fun cleanMaterialAssetFileName(value: String?): String? =
    value
        ?.replace('\\', '/')
        ?.substringAfterLast('/')
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?.take(240)

private fun isSafeMaterialSvg(bytes: ByteArray): Boolean {
    val text = decodeStrictUtf8(bytes) ?: return false
    if (!Regex("""<\s*svg\b""", RegexOption.IGNORE_CASE).containsMatchIn(text)) return false
    return unsafeMaterialSvgPatterns.none { it.containsMatchIn(text) }
}

private fun decodeStrictUtf8(bytes: ByteArray): String? =
    runCatching {
        StandardCharsets.UTF_8
            .newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes))
            .toString()
    }.getOrNull()
