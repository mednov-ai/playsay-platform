package com.playsay.gateway.service.game

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.playsay.gateway.dto.HtmlGameMigrationOutcome
import com.playsay.gateway.dto.HtmlGameMigrationResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.repo.game.HtmlGameRepository
import com.playsay.gateway.service.MaterialObjectStorage
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

@Service
class HtmlGameLibraryMigrationService(
    private val repository: HtmlGameRepository,
    private val registration: HtmlGameLegacyRegistrationService,
    private val assets: MaterialAssetRepo,
    private val objects: MaterialObjectStorage,
    private val mapper: ObjectMapper,
    private val provenance: LegacyGameProvenanceService,
    private val blobs: GameBlobStorageService,
    transactionManager: PlatformTransactionManager,
) {
    private val transaction = TransactionTemplate(transactionManager)

    fun requireDrained() {
        val active = repository.jdbc.queryForObject("SELECT COUNT(*) FROM lesson WHERE status='IN_PROGRESS'", Long::class.java) ?: 0
        val jobs = repository.jdbc.queryForObject("SELECT (SELECT COUNT(*) FROM html_game_processing WHERE status IN ('PENDING','RUNNING')) + (SELECT COUNT(*) FROM material_game_adaptation WHERE status IN ('PENDING','RETRY','ANALYZING','PATCHING','VALIDATING')) + (SELECT COUNT(*) FROM material_html_game_enrichment WHERE status IN ('PENDING','RETRY','RUNNING'))", Long::class.java) ?: 0
        if (jobs != 0L) gameError(HttpStatus.CONFLICT, "GAME_MIGRATION_JOBS_NOT_DRAINED")
        if (active != 0L) gameError(HttpStatus.CONFLICT, "GAME_MIGRATION_NOT_DRAINED")
    }

    fun batch(dryRun: Boolean, after: UUID? = null, limit: Int = 25): HtmlGameMigrationResponse {
        if (!dryRun) requireDrained()
        requireLimit(limit)
        val outcomes = sourceIds(after, limit).map { id -> migrateSource(id, dryRun) }
        val remaining = repository.jdbc.queryForObject("SELECT COUNT(*) FROM material_asset a WHERE a.kind='HTML_GAME' AND NOT EXISTS(SELECT 1 FROM html_game_legacy_alias x WHERE x.asset_id=a.id) AND NOT EXISTS(SELECT 1 FROM html_game_migration_checkpoint c WHERE c.asset_id=a.id AND c.outcome='CANDIDATE')", Long::class.java) ?: 0
        return HtmlGameMigrationResponse(dryRun, outcomes, remaining)
    }

    private fun migrateSource(id: UUID, dryRun: Boolean): HtmlGameMigrationOutcome = try {
        requireNotNull(transaction.execute { sourceOutcome(id, dryRun) })
    } catch (error: Exception) {
        val code = (error as? ProjectResponseException)?.errorCode ?: "GAME_MIGRATION_FAILED"
        if (!dryRun) transaction.executeWithoutResult { checkpoint(id, "BLOCKED", code) }
        HtmlGameMigrationOutcome(id, "BLOCKED", code)
    }

    private fun sourceOutcome(id: UUID, dryRun: Boolean): HtmlGameMigrationOutcome {
        val asset = assets.findById(id).orElseThrow()
        val bytes = provenance.bytes(asset)
        if (bytes.isEmpty()) gameError(HttpStatus.CONFLICT, "GAME_CONTENT_INVALID")
        val origin = if (repository.alias(id) == null) provenance.inspect(asset, bytes) else LegacyGameOrigin(asset, null, null, true)
        if (!origin.accepted) {
            if (!dryRun) retainCandidate(id, bytes, origin)
            return HtmlGameMigrationOutcome(id, "CANDIDATE")
        }
        if (dryRun) return HtmlGameMigrationOutcome(id, "READY")
        val alias = registration.register(id)
        verifyPlayable(alias.revisionId, alias.sha256)
        if (alias.sha256 != gameHash(bytes)) gameError(HttpStatus.CONFLICT, "GAME_CONTENT_INVALID")
        checkpoint(id, "MAPPED", null, alias.sha256)
        return HtmlGameMigrationOutcome(id, "MAPPED")
    }

    private fun retainCandidate(id: UUID, bytes: ByteArray, origin: LegacyGameOrigin) {
        val source = registration.register(origin.sourceAssetId ?: gameError(HttpStatus.CONFLICT, "GAME_PROVENANCE_UNRESOLVED"))
        val existing = repository.jdbc.queryForList("SELECT retained_blob_id,source_sha256 FROM html_game_migration_checkpoint WHERE asset_id=? AND outcome='CANDIDATE'", id).firstOrNull()
        val retained = existing?.get("retained_blob_id") as? UUID
        val blob = if (retained != null && existing["source_sha256"] == gameHash(bytes)) { blobs.read(retained); retained }
            else blobs.put(source.gameId, bytes, "text/html")
        checkpoint(id, "CANDIDATE", null, gameHash(bytes), blob, provenance.evidence(origin))
    }

    /** Separate keyset pass; only exact reference fields change, with document concurrency protection. */
    fun materials(dryRun: Boolean, after: UUID? = null, limit: Int = 25): List<UUID> {
        if (!dryRun) requireDrained()
        requireLimit(limit)
        val ids = materialRows(after, limit).map { it["id"] as UUID }
        ids.forEach { id ->
            try { transaction.executeWithoutResult { convertMaterial(id, dryRun) } }
            catch (error: ProjectResponseException) { throw error }
            catch (_: Exception) { gameError(HttpStatus.CONFLICT, "GAME_MIGRATION_FAILED") }
        }
        return ids
    }

    private fun convertMaterial(id: UUID, dryRun: Boolean) {
        val row = repository.jdbc.queryForMap("SELECT document,updated_at FROM lesson_material WHERE id=?", id)
        val original = row["document"].toString()
        val document = mapper.readTree(original)
        // Evaluate every block: any() would stop after the first converted occurrence.
        val changed = blocks(document).map { convertBlock(it, dryRun) }.any { it }
        if (!changed || dryRun) return
        val count = repository.jdbc.update("UPDATE lesson_material SET document=?,updated_at=? WHERE id=? AND document=? AND updated_at=?", mapper.writeValueAsString(document), Timestamp.from(Instant.now()), id, original, row["updated_at"])
        if (count != 1) gameError(HttpStatus.CONFLICT, "GAME_MATERIAL_CONFLICT")
    }

    private fun convertBlock(node: JsonNode, dryRun: Boolean): Boolean {
        val block = node as? ObjectNode ?: return false
        if (block.path("type").asText() != "htmlGame" || block.hasNonNull("gameId")) return false
        val url = block.path("url").asText()
        if (url.isBlank()) return false
        if (!url.startsWith("material-asset:")) gameError(HttpStatus.CONFLICT, "GAME_REFERENCE_UNRESOLVED")
        val source = gameUuid(url.removePrefix("material-asset:"))
        val alias = repository.alias(source)
        if (alias == null) {
            if (dryRun && assets.findById(source).orElse(null)?.kind == "HTML_GAME") return false
            gameError(HttpStatus.CONFLICT, "GAME_REFERENCE_UNRESOLVED")
        }
        val game = repository.game(alias.gameId, alias.revisionId) ?: gameError(HttpStatus.CONFLICT, "GAME_REFERENCE_UNRESOLVED")
        block.put("gameId", alias.gameId.toString()).put("gameRevisionId", alias.revisionId.toString())
        if (!block.hasNonNull("gameSyncCompatibility")) block.put("gameSyncCompatibility", game.compatibility)
        block.remove("url")
        return true
    }

    /** Full read-only cutoff audit, never a cached count or first-page sample. */
    fun reconcile(): Map<String, Long> {
        requireDrained()
        var after: UUID? = null
        var mapped = 0L
        var candidates = 0L
        do {
            val ids = sourceIds(after, 25)
            ids.forEach { if (verifySource(it)) mapped++ else candidates++ }
            after = ids.lastOrNull()
        } while (after != null)
        var references = 0L
        after = null
        do {
            val rows = materialRows(after, 25)
            rows.forEach { row -> references += blocks(mapper.readTree(row["document"].toString())).count(::verifyReference) }
            after = rows.lastOrNull()?.get("id") as? UUID
        } while (after != null)
        return mapOf("inventoryVersion" to 1L, "mapped" to mapped, "candidates" to candidates, "references" to references, "unresolved" to 0L)
    }

    private fun verifySource(id: UUID): Boolean {
        val asset = assets.findById(id).orElseThrow()
        val bytes = provenance.bytes(asset)
        val hash = gameHash(bytes)
        val alias = repository.alias(id)
        if (alias != null) {
            if (hash != alias.sha256) gameError(HttpStatus.CONFLICT, "GAME_CONTENT_INVALID")
            verifyPlayable(alias.revisionId, hash)
            return true
        }
        val entry = repository.jdbc.queryForList("SELECT retained_blob_id,source_sha256 FROM html_game_migration_checkpoint WHERE asset_id=? AND outcome='CANDIDATE'", id).firstOrNull() ?: gameError(HttpStatus.CONFLICT, "GAME_REFERENCE_UNRESOLVED")
        if (entry["source_sha256"] != hash || gameHash(blobs.read(entry["retained_blob_id"] as UUID)) != hash) gameError(HttpStatus.CONFLICT, "GAME_CONTENT_INVALID")
        if (provenance.inspect(asset, bytes).accepted) gameError(HttpStatus.CONFLICT, "GAME_PROVENANCE_UNRESOLVED")
        return false
    }

    private fun verifyPlayable(revisionId: UUID, hash: String) {
        val blob = repository.blob(revisionId) ?: gameError(HttpStatus.CONFLICT, "GAME_REFERENCE_UNRESOLVED")
        if (blob.sha256 != hash || gameHash(objects.getObject(blob.storageKey).bytes) != hash) gameError(HttpStatus.CONFLICT, "GAME_CONTENT_INVALID")
        repository.blob(revisionId, true)?.let { cover -> if (gameHash(objects.getObject(cover.storageKey).bytes) != cover.sha256) gameError(HttpStatus.CONFLICT, "GAME_CONTENT_INVALID") }
    }

    private fun verifyReference(block: JsonNode): Boolean {
        if (block.path("type").asText() != "htmlGame") return false
        val game = block.path("gameId").asText()
        val revision = block.path("gameRevisionId").asText()
        if (block.path("url").asText().isNotBlank()) gameError(HttpStatus.CONFLICT, "GAME_REFERENCE_UNRESOLVED")
        if (game.isBlank() && revision.isBlank()) return false
        if (repository.game(gameUuid(game), gameUuid(revision)) == null) gameError(HttpStatus.CONFLICT, "GAME_REFERENCE_UNRESOLVED")
        return true
    }

    private fun blocks(document: JsonNode): List<JsonNode> = document.path("pages").flatMap { it.path("blocks").toList() }
    private fun requireLimit(limit: Int) { if (limit !in 1..100) gameError(HttpStatus.BAD_REQUEST, "GAME_MIGRATION_LIMIT_INVALID") }
    private fun sourceIds(after: UUID?, limit: Int): List<UUID> = if (after == null) repository.jdbc.queryForList("SELECT id FROM material_asset WHERE kind='HTML_GAME' ORDER BY id LIMIT ?", UUID::class.java, limit).filterNotNull()
        else repository.jdbc.queryForList("SELECT id FROM material_asset WHERE kind='HTML_GAME' AND id>? ORDER BY id LIMIT ?", UUID::class.java, after, limit).filterNotNull()
    private fun materialRows(after: UUID?, limit: Int): List<Map<String, Any?>> = if (after == null) repository.jdbc.queryForList("SELECT id,document FROM lesson_material ORDER BY id LIMIT ?", limit)
        else repository.jdbc.queryForList("SELECT id,document FROM lesson_material WHERE id>? ORDER BY id LIMIT ?", after, limit)

    private fun checkpoint(id: UUID, outcome: String, error: String?, hash: String? = null, retainedBlob: UUID? = null, evidence: String = "{}") {
        repository.jdbc.update("DELETE FROM html_game_migration_checkpoint WHERE asset_id=?", id)
        repository.jdbc.update("INSERT INTO html_game_migration_checkpoint(asset_id,outcome,error_code,source_sha256,retained_blob_id,provenance,updated_at) VALUES(?,?,?,?,?,?,?)", id, outcome, error, hash, retainedBlob, evidence, Timestamp.from(Instant.now()))
    }
}
