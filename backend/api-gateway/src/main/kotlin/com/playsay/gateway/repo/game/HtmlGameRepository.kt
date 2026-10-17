package com.playsay.gateway.repo.game

import com.playsay.gateway.dto.HtmlGameResponse
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository

/** JDBC ownership keeps backfill queries bounded and independent of material cascades. */
@Repository
class HtmlGameRepository(private val jdbc: JdbcTemplate, private val jsonMapper: com.fasterxml.jackson.databind.ObjectMapper, val launches: LessonGameRepository, val processing: HtmlGameProcessingRepository, val migration: HtmlGameMigrationRepository) {
    fun game(id: UUID, revisionId: UUID? = null): HtmlGameResponse? {
        val clause = if (revisionId == null) "r.id=g.current_revision_id" else "r.id=?"
        val args = if (revisionId == null) arrayOf<Any>(id) else arrayOf<Any>(revisionId, id)
        return jdbc.query("$summarySql AND $clause WHERE g.id=?", mapper, *args).firstOrNull()
    }

    fun creator(id: UUID): UUID? = jdbc.query("SELECT creator_user_id FROM html_game WHERE id=?", RowMapper { rs, _ -> rs.uuidOrNull("creator_user_id") }, id).firstOrNull()

    fun lockGame(id: UUID) { jdbc.queryForList("SELECT id FROM html_game WHERE id=? FOR UPDATE", id) }
    fun lockCreator(id: UUID) { jdbc.queryForList("SELECT id FROM app_user WHERE id=? FOR UPDATE", id) }

    fun list(search: String, topic: String, level: String?, compatibility: String?, page: Int, size: Int): Pair<List<HtmlGameResponse>, Long> {
        val filters = StringBuilder(" WHERE g.status='ACTIVE'")
        val args = mutableListOf<Any>()
        if (search.isNotEmpty()) { filters.append(" AND LOWER(g.title) LIKE ? ESCAPE '!'"); args.add("%" + search.lowercase().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%") }
        if (topic.isNotEmpty()) { filters.append(" AND LOWER(g.topic)=?"); args.add(topic.lowercase()) }
        if (level != null) { filters.append(" AND g.cefr_level=?"); args.add(level) }
        if (compatibility != null) { filters.append(" AND r.compatibility=?"); args.add(compatibility) }
        val query = "$summarySql AND r.id=g.current_revision_id$filters"
        val total = jdbc.queryForObject("SELECT COUNT(*) FROM ($query) catalog", Long::class.java, *args.toTypedArray()) ?: 0
        return jdbc.query("$query ORDER BY g.updated_at DESC,g.id LIMIT ? OFFSET ?", mapper, *(args + listOf(size, page.toLong() * size)).toTypedArray()) to total
    }

    fun blob(revisionId: UUID, cover: Boolean = false): GameBlob? = jdbc.query(
        "SELECT b.* FROM html_game_revision r JOIN html_game_blob b ON b.id=" + (if (cover) "r.cover_blob_id" else "r.blob_id") + " WHERE r.id=?",
        RowMapper { rs, _ -> GameBlob(rs.getString("storage_key"), rs.getString("sha256"), rs.getString("content_type"), rs.getLong("byte_size")) }, revisionId,
    ).firstOrNull()

    fun command(key: String): StoredGameCommand? = jdbc.query("SELECT * FROM html_game_command WHERE command_key=?", RowMapper { rs, _ -> StoredGameCommand(rs.getString("payload_hash"), rs.uuid("game_id"), rs.uuid("revision_id")) }, key).firstOrNull()

    fun alias(assetId: UUID): GameAlias? = jdbc.query("SELECT * FROM html_game_legacy_alias WHERE asset_id=?", RowMapper { rs, _ -> GameAlias(rs.uuid("source_material_id"), rs.uuid("game_id"), rs.uuid("revision_id"), rs.getString("sha256")) }, assetId).firstOrNull()


    fun insertBlob(id: UUID, key: String, hash: String, size: Int, contentType: String, now: java.sql.Timestamp) = jdbc.update("INSERT INTO html_game_blob(id,storage_key,sha256,byte_size,content_type,created_at) VALUES(?,?,?,?,?,?)", id, key, hash, size, contentType, now)
    fun storedBlob(id: UUID) = jdbc.queryForList("SELECT storage_key,sha256 FROM html_game_blob WHERE id=?", id)
    fun createGame(id: UUID, creator: UUID?, title: String, now: java.sql.Timestamp, topic: String = "", level: String? = null, derived: UUID? = null) = jdbc.update("INSERT INTO html_game(id,creator_user_id,title,topic,cefr_level,status,derived_from_revision_id,created_at,updated_at) VALUES(?,?,?,?,?,'ACTIVE',?,?,?)", id, creator, title, topic, level, derived, now, now)
    fun advanceRevision(revision: UUID, now: java.sql.Timestamp, id: UUID) = jdbc.update("UPDATE html_game SET current_revision_id=?,version=version+1,updated_at=? WHERE id=?", revision, now, id)
    fun selectRevision(revision: UUID, now: java.sql.Timestamp, id: UUID, version: Long) = jdbc.update("UPDATE html_game SET current_revision_id=?,version=version+1,updated_at=? WHERE id=? AND version=?", revision, now, id, version)
    fun recordCommand(key: String, hash: String, id: UUID, revision: UUID) = jdbc.update("INSERT INTO html_game_command(command_key,payload_hash,game_id,revision_id) VALUES(?,?,?,?)", key, hash, id, revision)
    fun editMetadata(title: String, topic: String, level: String?, now: java.sql.Timestamp, id: UUID, version: Long) = jdbc.update("UPDATE html_game SET title=?,title_source='USER',topic=?,cefr_level=?,version=version+1,updated_at=? WHERE id=? AND version=?", title, topic, level, now, id, version)
    fun archive(now: java.sql.Timestamp, id: UUID) = jdbc.update("UPDATE html_game SET status='ARCHIVED',version=version+1,updated_at=? WHERE id=?", now, id)
    fun copyRevision(revision: UUID, game: UUID, now: java.sql.Timestamp, source: UUID) = jdbc.update("INSERT INTO html_game_revision(id,game_id,blob_id,cover_blob_id,source_revision_id,compatibility,metadata,created_at) SELECT ?,?,blob_id,cover_blob_id,id,compatibility,metadata,? FROM html_game_revision WHERE id=?", revision, game, now, source)
    fun setInitialRevision(revision: UUID, id: UUID) = jdbc.update("UPDATE html_game SET current_revision_id=? WHERE id=?", revision, id)
    fun insertRevision(id: UUID, game: UUID, blob: UUID, source: UUID?, compatibility: String, metadata: String, now: java.sql.Timestamp) = jdbc.update("INSERT INTO html_game_revision(id,game_id,blob_id,source_revision_id,compatibility,metadata,created_at) VALUES(?,?,?,?,?,?,?)", id, game, blob, source, compatibility, metadata, now)
    fun insertAlias(asset: UUID, material: UUID, game: UUID, revision: UUID, hash: String) = jdbc.update("INSERT INTO html_game_legacy_alias(asset_id,source_material_id,game_id,revision_id,sha256) VALUES(?,?,?,?,?)", asset, material, game, revision, hash)
    fun legacyCover(asset: UUID, root: UUID) = jdbc.queryForList("SELECT icon_asset_id FROM material_html_game_enrichment WHERE (asset_id=? OR asset_id=?) AND status='READY' AND icon_asset_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1", asset, root)
    fun retainAuthoredTitle(title: String, now: java.sql.Timestamp, game: UUID, revision: UUID) = jdbc.update("UPDATE html_game SET title=?,updated_at=? WHERE id=? AND current_revision_id=? AND title_source<>'USER'", title, now, game, revision)
    fun setCover(cover: UUID, revision: UUID) = jdbc.update("UPDATE html_game_revision SET cover_blob_id=? WHERE id=?", cover, revision)
    fun adaptationHistory(source: UUID, adapted: UUID) = jdbc.queryForList("SELECT status,mechanics_validation FROM material_game_adaptation WHERE source_asset_id=? AND adapted_asset_id=?", source, adapted)
    fun adaptationEvidence(source: UUID, adapted: UUID) = jdbc.queryForList("SELECT status,mechanics_validation,validator_version,source_hash,validation_report,report,model,prompt_hash FROM material_game_adaptation WHERE source_asset_id=? AND adapted_asset_id=? ORDER BY updated_at", source, adapted)
    fun materialCommand(key: String) = jdbc.queryForList("SELECT * FROM html_game_material_command WHERE command_key=?", key)
    fun recordMaterialCommand(key: String, game: UUID, revision: UUID, material: UUID) = jdbc.update("INSERT INTO html_game_material_command(command_key,game_id,revision_id,material_id) VALUES(?,?,?,?)", key, game, revision, material)
    fun lockUploadScope(lesson: Boolean, id: UUID) { if (lesson) jdbc.queryForList("SELECT id FROM lesson WHERE id=? FOR UPDATE", id) else jdbc.queryForList("SELECT id FROM lesson_material WHERE id=? FOR UPDATE", id) }
    fun uploadCommand(key: String) = jdbc.queryForList("SELECT payload_hash,result FROM html_game_legacy_upload_command WHERE command_key=?", key)
    fun recordUploadCommand(key: String, hash: String, result: String) = jdbc.update("INSERT INTO html_game_legacy_upload_command(command_key,payload_hash,result) VALUES(?,?,?)", key, hash, result)

    private val mapper = RowMapper { rs: ResultSet, _: Int -> HtmlGameResponse(rs.uuid("id"), rs.uuid("revision_id"), rs.getString("title"), rs.getString("topic"), rs.getString("cefr_level"), rs.getString("compatibility"), rs.getString("status"), hasCover = rs.getObject("cover_blob_id") != null, version = rs.getLong("version"), createdAt = rs.getTimestamp("created_at").toInstant(), updatedAt = rs.getTimestamp("updated_at").toInstant(), validationStatus = validationStatus(rs.getString("revision_metadata"))) }

    private fun validationStatus(metadata: String): String? = jsonMapper.readTree(metadata).path("mechanicsValidation").asText().takeIf { it.isNotBlank() }

    private val summarySql = "SELECT g.*,r.id AS revision_id,r.compatibility,r.cover_blob_id,r.metadata AS revision_metadata FROM html_game g JOIN html_game_revision r ON r.game_id=g.id"
}

data class GameBlob(val storageKey: String, val sha256: String, val contentType: String, val byteSize: Long)
data class StoredGameCommand(val payloadHash: String, val gameId: UUID, val revisionId: UUID)
data class GameAlias(val sourceMaterialId: UUID, val gameId: UUID, val revisionId: UUID, val sha256: String)
internal fun ResultSet.uuid(field: String): UUID = getObject(field, UUID::class.java)
internal fun ResultSet.uuidOrNull(field: String): UUID? = getObject(field, UUID::class.java)
