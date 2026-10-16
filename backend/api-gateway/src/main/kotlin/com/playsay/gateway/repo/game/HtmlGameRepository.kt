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
class HtmlGameRepository(val jdbc: JdbcTemplate, private val jsonMapper: com.fasterxml.jackson.databind.ObjectMapper) {
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

    private val mapper = RowMapper { rs: ResultSet, _: Int -> HtmlGameResponse(rs.uuid("id"), rs.uuid("revision_id"), rs.getString("title"), rs.getString("topic"), rs.getString("cefr_level"), rs.getString("compatibility"), rs.getString("status"), hasCover = rs.getObject("cover_blob_id") != null, version = rs.getLong("version"), createdAt = rs.getTimestamp("created_at").toInstant(), updatedAt = rs.getTimestamp("updated_at").toInstant(), validationStatus = validationStatus(rs.getString("revision_metadata"))) }

    private fun validationStatus(metadata: String): String? = jsonMapper.readTree(metadata).path("mechanicsValidation").asText().takeIf { it.isNotBlank() }

    private val summarySql = "SELECT g.*,r.id AS revision_id,r.compatibility,r.cover_blob_id,r.metadata AS revision_metadata FROM html_game g JOIN html_game_revision r ON r.game_id=g.id"
}

data class GameBlob(val storageKey: String, val sha256: String, val contentType: String, val byteSize: Long)
data class StoredGameCommand(val payloadHash: String, val gameId: UUID, val revisionId: UUID)
data class GameAlias(val sourceMaterialId: UUID, val gameId: UUID, val revisionId: UUID, val sha256: String)
internal fun ResultSet.uuid(field: String): UUID = getObject(field, UUID::class.java)
internal fun ResultSet.uuidOrNull(field: String): UUID? = getObject(field, UUID::class.java)
