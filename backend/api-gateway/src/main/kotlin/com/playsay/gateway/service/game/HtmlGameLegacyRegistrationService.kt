package com.playsay.gateway.service.game

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.repo.game.GameAlias
import com.playsay.gateway.repo.game.HtmlGameRepository
import com.playsay.gateway.service.MaterialObjectStorage
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** Trusted bridge for already-validated uploads and verified backfill, never an anonymous API. */
@Service
class HtmlGameLegacyRegistrationService(
    private val games: HtmlGameLibraryService,
    private val repository: HtmlGameRepository,
    private val assets: MaterialAssetRepo,
    private val materials: LessonMaterialRepo,
    private val objects: MaterialObjectStorage,
    private val mapper: ObjectMapper,
    private val provenance: LegacyGameProvenanceService,
    private val blobs: GameBlobStorageService,
) {
    fun withReference(asset: com.playsay.gateway.dto.MaterialAssetResponse): com.playsay.gateway.dto.MaterialAssetResponse {
        val alias = register(asset.id)
        val metadata = asset.metadata.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
            .put("gameId", alias.gameId.toString()).put("gameRevisionId", alias.revisionId.toString())
        return asset.copy(metadata = metadata)
    }

    fun requireWritable() = games.requireWritable()

    @Transactional
    fun register(assetId: UUID): GameAlias = registerRecursive(assetId, emptySet())

    private fun registerRecursive(assetId: UUID, visited: Set<UUID>): GameAlias {
        if (assetId in visited || visited.size >= 64) gameError(HttpStatus.CONFLICT, "GAME_LINEAGE_INVALID")
        val path = visited + assetId
        val asset = assets.findById(assetId).orElse(null) ?: gameError(HttpStatus.NOT_FOUND, "GAME_SOURCE_NOT_FOUND")
        // Serialize with copy/author operations by the source material, including ownerless records.
        val material = materials.lockById(asset.materialId) ?: gameError(HttpStatus.NOT_FOUND, "GAME_SOURCE_NOT_FOUND")
        repository.alias(assetId)?.let { return it }
        if (asset.kind != "HTML_GAME") gameError(HttpStatus.BAD_REQUEST, "GAME_SOURCE_INVALID")
        val bytes = provenance.bytes(asset)
        val hash = gameHash(bytes)
        val origin = provenance.inspect(asset, bytes)
        if (!origin.accepted) gameError(HttpStatus.CONFLICT, "GAME_ADAPTATION_NOT_ACCEPTED")
        val metadata = mapper.readTree(asset.metadata)
        val copyAlias = parentAlias(material, origin.verifiedParent, path)?.takeIf { it.sha256 == hash }
        val sourceAlias = if (copyAlias == null) origin.sourceAssetId?.let { source -> repository.alias(source) ?: registerRecursive(source, path) } else null
        val now = Timestamp.from(Instant.now())
        val sourceNeedsFork = sourceAlias != null && repository.creator(sourceAlias.gameId) != material.ownerTeacherUserId
        val gameId = targetGame(material.ownerTeacherUserId, metadata.path("gameTitle").asText(), sourceAlias, copyAlias, sourceNeedsFork, now)
        val revisionId = copyAlias?.revisionId ?: games.addRevision(gameId, bytes, mapper.readTree(origin.root.metadata).path("syncCompatibility").asText("UNSUPPORTED"), provenance.evidence(origin), sourceAlias?.revisionId)
        if (shouldAdvanceCurrent(copyAlias, sourceAlias, sourceNeedsFork, origin.current)) repository.jdbc.update("UPDATE html_game SET current_revision_id=?,version=version+1,updated_at=? WHERE id=?", revisionId, now, gameId)
        repository.jdbc.update("INSERT INTO html_game_legacy_alias(asset_id,source_material_id,game_id,revision_id,sha256) VALUES(?,?,?,?,?)", assetId, material.id, gameId, revisionId, hash)
        val cover = repository.jdbc.queryForList("SELECT icon_asset_id FROM material_html_game_enrichment WHERE (asset_id=? OR asset_id=?) AND status='READY' AND icon_asset_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1", assetId, origin.root.id).firstOrNull()?.get("icon_asset_id") as? UUID
        if (cover != null) copyCover(gameId, revisionId, cover)
        return GameAlias(material.id, gameId, revisionId, hash)
    }
    private fun shouldAdvanceCurrent(copy: GameAlias?, source: GameAlias?, fork: Boolean, current: Boolean): Boolean =
        copy == null && (source == null || fork || current)

    private fun targetGame(owner: UUID?, rawTitle: String, source: GameAlias?, copy: GameAlias?, fork: Boolean, now: Timestamp): UUID {
        if (copy != null) return copy.gameId
        if (source != null && !fork) return source.gameId
        val id = UUID.randomUUID()
        val title = rawTitle.trim().take(160).ifEmpty { "HTML game" }
        repository.jdbc.update("INSERT INTO html_game(id,creator_user_id,title,topic,status,derived_from_revision_id,created_at,updated_at) VALUES(?,?,?,'','ACTIVE',?,?,?)", id, owner, title, source?.revisionId, now, now)
        return id
    }

    private fun parentAlias(material: com.playsay.gateway.entity.LessonMaterialEntity, parentId: UUID?, path: Set<UUID>): GameAlias? {
        if (parentId == null || parentId in path || material.ownerTeacherUserId == null) return null
        val parent = assets.findById(parentId).orElse(null) ?: return null
        val parentMaterial = materials.findById(parent.materialId).orElse(null) ?: return null
        if (parentMaterial.ownerTeacherUserId != material.ownerTeacherUserId) return null
        return repository.alias(parentId) ?: registerRecursive(parentId, path)
    }

    @Transactional
    fun enrichment(assetId: UUID, title: String, iconAssetId: UUID) {
        val alias = repository.alias(assetId) ?: register(assetId)
        copyCover(alias.gameId, alias.revisionId, iconAssetId)
        repository.jdbc.update("UPDATE html_game SET title=?,updated_at=? WHERE id=? AND current_revision_id=? AND title_source<>'USER'", title.take(160), Timestamp.from(Instant.now()), alias.gameId, alias.revisionId)
    }

    private fun copyCover(gameId: UUID, revisionId: UUID, assetId: UUID) {
        val asset = assets.findById(assetId).orElse(null) ?: gameError(HttpStatus.NOT_FOUND, "GAME_COVER_NOT_FOUND")
        val content = objects.getObject(asset.storageKey ?: gameError(HttpStatus.NOT_FOUND, "GAME_COVER_NOT_FOUND"))
        if (content.contentType !in setOf("image/png", "image/jpeg", "image/webp", "image/svg+xml")) gameError(HttpStatus.BAD_REQUEST, "GAME_COVER_INVALID")
        val id = blobs.put(gameId, content.bytes, content.contentType)
        repository.jdbc.update("UPDATE html_game_revision SET cover_blob_id=? WHERE id=?", id, revisionId)
    }

}
