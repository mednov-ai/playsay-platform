package com.playsay.gateway.repo.game

import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository

/** Bounded migration inventories, durable outcomes and compare-and-swap document writes. */
@Repository
class HtmlGameMigrationRepository(private val jdbc: JdbcTemplate) {
    fun lessonWindows(): List<GameMigrationLessonWindow> = jdbc.query("SELECT scheduled_end,access_extension_seconds FROM lesson WHERE status='IN_PROGRESS'", RowMapper { rs, _ -> GameMigrationLessonWindow(rs.getTimestamp("scheduled_end")?.toInstant(), rs.getInt("access_extension_seconds")) })
    fun pendingJobs() = jdbc.queryForObject("SELECT (SELECT COUNT(*) FROM html_game_processing WHERE status IN ('PENDING','RUNNING')) + (SELECT COUNT(*) FROM material_game_adaptation WHERE status IN ('PENDING','RETRY','ANALYZING','PATCHING','VALIDATING')) + (SELECT COUNT(*) FROM material_html_game_enrichment WHERE status IN ('PENDING','RETRY','RUNNING'))", Long::class.java) ?: 0
    fun remaining() = jdbc.queryForObject("SELECT COUNT(*) FROM material_asset a WHERE a.kind='HTML_GAME' AND NOT EXISTS(SELECT 1 FROM html_game_legacy_alias x WHERE x.asset_id=a.id) AND NOT EXISTS(SELECT 1 FROM html_game_migration_checkpoint c WHERE c.asset_id=a.id AND c.outcome='CANDIDATE')", Long::class.java) ?: 0
    fun retainedCandidate(id: UUID) = jdbc.queryForList("SELECT retained_blob_id,source_sha256 FROM html_game_migration_checkpoint WHERE asset_id=? AND outcome='CANDIDATE'", id)
    fun material(id: UUID) = jdbc.queryForMap("SELECT document,updated_at FROM lesson_material WHERE id=?", id)
    fun convertMaterial(document: String, now: Timestamp, id: UUID, original: String, originalTime: Any?) = jdbc.update("UPDATE lesson_material SET document=?,updated_at=? WHERE id=? AND document=? AND updated_at=?", document, now, id, original, originalTime)
    fun sourceIds(after: UUID?, limit: Int): List<UUID> = if (after == null) jdbc.queryForList("SELECT id FROM material_asset WHERE kind='HTML_GAME' ORDER BY id LIMIT ?", UUID::class.java, limit).filterNotNull() else jdbc.queryForList("SELECT id FROM material_asset WHERE kind='HTML_GAME' AND id>? ORDER BY id LIMIT ?", UUID::class.java, after, limit).filterNotNull()
    fun materials(after: UUID?, limit: Int): List<Map<String, Any?>> = if (after == null) jdbc.queryForList("SELECT id,document FROM lesson_material ORDER BY id LIMIT ?", limit) else jdbc.queryForList("SELECT id,document FROM lesson_material WHERE id>? ORDER BY id LIMIT ?", after, limit)
    fun checkpoint(id: UUID, outcome: String, error: String?, hash: String?, retained: UUID?, evidence: String, now: Timestamp) {
        jdbc.update("DELETE FROM html_game_migration_checkpoint WHERE asset_id=?", id)
        jdbc.update("INSERT INTO html_game_migration_checkpoint(asset_id,outcome,error_code,source_sha256,retained_blob_id,provenance,updated_at) VALUES(?,?,?,?,?,?,?)", id, outcome, error, hash, retained, evidence, now)
    }
}

data class GameMigrationLessonWindow(val scheduledEnd: Instant?, val extensionSeconds: Int)
