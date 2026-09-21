package com.playsay.gateway.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialDocumentPageManifestResponse
import com.playsay.gateway.dto.MaterialDocumentUploadResponse
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.utils.MetaData
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile

@Component
class MaterialDocumentAssetService(
    private val materialAssetRepo: MaterialAssetRepo,
    private val materialObjectStorage: MaterialObjectStorage,
    private val preparationService: MaterialDocumentPreparationService,
    private val objectMapper: ObjectMapper = jacksonObjectMapper(),
) {
    @Synchronized
    fun upload(materialId: UUID, file: MultipartFile, idempotencyKey: String?): MaterialDocumentUploadResponse {
        return uploadPrepared(materialId, preparationService.prepare(file), idempotencyKey)
    }

    @Synchronized
    fun uploadPrepared(
        materialId: UUID,
        prepared: PreparedMaterialDocument,
        idempotencyKey: String?,
    ): MaterialDocumentUploadResponse {
        val key = idempotencyKey?.trim()?.takeIf { it.isNotEmpty() }?.take(120) ?: UUID.randomUUID().toString()
        val sourceId = deterministicId(materialId, "document-source:$key")
        val displayId = deterministicId(materialId, "document-display:$key")
        val sourceHash = sha256(prepared.sourceBytes)
        materialAssetRepo.findById(sourceId).orElse(null)?.let { existing ->
            val metadata = readMetadata(existing.metadata)
            if (metadata.path("sourceSha256").asText() != sourceHash) {
                throw ProjectResponseException.localized(
                    HttpStatus.CONFLICT,
                    MetaData.ErrorCodes.MATERIAL_DOCUMENT_IDEMPOTENCY_CONFLICT,
                )
            }
            return response(existing)
        }

        val sourceKey = "material-assets/$materialId/$sourceId.source.${prepared.extension}"
        val displayKey = "material-assets/$materialId/$displayId.display.${prepared.extension}"
        val now = Instant.now()
        try {
            materialObjectStorage.putObject(sourceKey, prepared.sourceBytes, prepared.mimeType)
            materialObjectStorage.putObject(displayKey, prepared.displayBytes, prepared.mimeType)
            val displayMetadata = documentMetadata(prepared, sourceId, sourceHash, displayKey, key, "READY")
            materialAssetRepo.saveAndFlush(
                MaterialAssetEntity(
                    id = displayId,
                    materialId = materialId,
                    kind = "DOCUMENT_DISPLAY",
                    storageKey = displayKey,
                    externalUrl = null,
                    provider = "USER",
                    metadata = objectMapper.writeValueAsString(displayMetadata),
                    createdAt = now,
                ),
            )
            val sourceMetadata = documentMetadata(prepared, displayId, sourceHash, sourceKey, key, "READY").apply {
                put("displayAssetId", displayId.toString())
            }
            val source = materialAssetRepo.saveAndFlush(
                MaterialAssetEntity(
                    id = sourceId,
                    materialId = materialId,
                    kind = "DOCUMENT_SOURCE",
                    storageKey = sourceKey,
                    externalUrl = null,
                    provider = "USER",
                    metadata = objectMapper.writeValueAsString(sourceMetadata),
                    createdAt = now,
                ),
            )
            return response(source)
        } catch (exception: MaterialObjectStorageException) {
            runCatching { materialObjectStorage.deleteObject(sourceKey) }
            runCatching { materialObjectStorage.deleteObject(displayKey) }
            throw ProjectResponseException.localized(HttpStatus.BAD_GATEWAY, MetaData.ErrorCodes.MATERIAL_ASSET_STORAGE_FAILED)
        } catch (exception: RuntimeException) {
            runCatching { materialObjectStorage.deleteObject(sourceKey) }
            runCatching { materialObjectStorage.deleteObject(displayKey) }
            throw exception
        }
    }

    fun status(materialId: UUID, uploadId: UUID): MaterialDocumentUploadResponse {
        val source = materialAssetRepo.findById(uploadId).orElse(null)
            ?.takeIf { it.materialId == materialId && it.kind == "DOCUMENT_SOURCE" }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.MATERIAL_ASSET_NOT_FOUND)
        return response(source)
    }

    private fun response(source: MaterialAssetEntity): MaterialDocumentUploadResponse {
        val metadata = readMetadata(source.metadata)
        val displayId = metadata.path("displayAssetId").asText().takeIf { it.isNotBlank() }?.let(UUID::fromString)
        val display = displayId?.let { materialAssetRepo.findById(it).orElse(null) }
        val pages = metadata.path("pageManifest").mapIndexed { index, page ->
            MaterialDocumentPageManifestResponse(
                id = page.path("id").asText("page-${index + 1}"),
                index = page.path("index").asInt(index),
                width = page.path("width").asDouble(1.0),
                height = page.path("height").asDouble(1.0),
            )
        }
        return MaterialDocumentUploadResponse(
            uploadId = source.id,
            status = metadata.path("status").asText("FAILED"),
            format = metadata.path("format").asText(),
            revision = metadata.path("revision").asText().takeIf { it.isNotBlank() },
            displayAsset = display?.toResponse(objectMapper),
            pageManifest = pages,
            errorCode = metadata.path("errorCode").asText().takeIf { it.isNotBlank() },
        )
    }

    private fun documentMetadata(
        prepared: PreparedMaterialDocument,
        relatedAssetId: UUID,
        sourceHash: String,
        storageKey: String,
        idempotencyKey: String,
        status: String,
    ) = objectMapper.createObjectNode().apply {
        put("status", status)
        put("format", prepared.format.name)
        put("revision", prepared.revision)
        put("sourceSha256", sourceHash)
        put("relatedAssetId", relatedAssetId.toString())
        put("idempotencyKey", idempotencyKey)
        put("fileName", prepared.originalFileName)
        put("mimeType", prepared.mimeType)
        put("byteSize", prepared.displayBytes.size)
        put("storageKey", storageKey)
        set<JsonNode>("pageManifest", objectMapper.valueToTree(prepared.pages))
    }

    private fun readMetadata(value: String): JsonNode =
        runCatching { objectMapper.readTree(value) }.getOrElse { objectMapper.createObjectNode() }

    private fun deterministicId(materialId: UUID, value: String): UUID =
        UUID.nameUUIDFromBytes("$materialId:$value".toByteArray(StandardCharsets.UTF_8))

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
