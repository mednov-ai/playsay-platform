package com.playsay.gateway.service.game

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.entity.MaterialAssetEntity
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.repo.game.HtmlGameRepository
import com.playsay.gateway.service.MaterialObjectStorage
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

internal data class LegacyGameOrigin(val root: MaterialAssetEntity, val verifiedParent: UUID?, val sourceAssetId: UUID?, val accepted: Boolean, val current: Boolean = true)

@Service
class LegacyGameProvenanceService(
    private val assets: MaterialAssetRepo,
    private val repository: HtmlGameRepository,
    private val objects: MaterialObjectStorage,
    private val mapper: ObjectMapper,
) {
    fun bytes(asset: MaterialAssetEntity): ByteArray {
        val key = repository.alias(asset.id)?.let { repository.blob(it.revisionId)?.storageKey } ?: asset.storageKey ?: gameError(HttpStatus.NOT_FOUND, "GAME_CONTENT_NOT_FOUND")
        return objects.getObject(key).bytes
    }

    internal fun inspect(asset: MaterialAssetEntity, sourceBytes: ByteArray): LegacyGameOrigin {
        val hash = gameHash(sourceBytes)
        val visited = mutableSetOf(asset.id)
        var current = asset
        var parent: UUID? = null
        while (visited.size < 64) {
            val copyId = mapper.readTree(current.metadata).path("copiedFromAssetId").asText().takeIf { it.isNotBlank() }?.let { runCatching { UUID.fromString(it) }.getOrNull() } ?: break
            if (copyId in visited) { current = asset; parent = null; break }
            val copy = assets.findById(copyId).orElse(null)?.takeIf { it.kind == "HTML_GAME" } ?: break
            if (runCatching { gameHash(bytes(copy)) }.getOrNull() != hash) break
            if (parent == null) parent = copyId
            visited += copyId
            current = copy
        }
        if (visited.size >= 64) { current = asset; parent = null }
        return adaptationOrigin(current, parent)
    }

    private fun adaptationOrigin(current: MaterialAssetEntity, parent: UUID?): LegacyGameOrigin {
        val source = mapper.readTree(current.metadata).path("sourceAssetId").asText().takeIf { it.isNotBlank() }?.let(::gameUuid)
        if (source == null) return LegacyGameOrigin(current, parent, null, true)
        val jobs = repository.adaptationHistory(source, current.id)
        if (jobs.isEmpty() || !assets.existsById(source)) gameError(HttpStatus.CONFLICT, "GAME_PROVENANCE_UNRESOLVED")
        val accepted = jobs.any { it["status"] in setOf("APPLIED", "ROLLED_BACK") }
        return LegacyGameOrigin(current, parent, source, accepted, jobs.any { it["status"] == "APPLIED" })
    }
    internal fun evidence(origin: LegacyGameOrigin): String {
        val document = mapper.createObjectNode().put("sourceKind", "LEGACY_UPLOAD")
        origin.sourceAssetId?.let { source ->
            val jobs = repository.adaptationEvidence(source, origin.root.id)
            document.set<com.fasterxml.jackson.databind.JsonNode>("adaptation", mapper.valueToTree(jobs))
            val sourceBytes = assets.findById(source).orElse(null)?.let(::bytes)
            val verified = jobs.any { it["mechanics_validation"] == "PASSED" && it["validator_version"] == com.playsay.gateway.service.MaterialGameMechanicsValidation.CURRENT_VALIDATOR_VERSION && sourceBytes != null && it["source_hash"] == gameHash(sourceBytes) }
            document.put("mechanicsValidation", if (verified) "PASSED" else "REVALIDATION_REQUIRED")
        }
        return document.toString()
    }

}
