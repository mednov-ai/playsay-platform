package com.playsay.gateway.service.game

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialGameAttachRequest
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.service.LessonMaterialCatalogService
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class MaterialGameReferenceService(
    private val games: HtmlGameLibraryService,
    private val materials: LessonMaterialRepo,
    private val mapper: ObjectMapper,
    private val repository: com.playsay.gateway.repo.game.HtmlGameRepository,
) {
    fun validate(document: JsonNode, previous: JsonNode? = null) {
        val oldBlocks = previous?.path("pages")?.flatMap { it.path("blocks").toList() }?.associateBy { it.path("id").asText() }.orEmpty()
        document.path("pages").flatMap { it.path("blocks").toList() }.filter { it.path("type").asText() == "htmlGame" }.forEach { block -> validateBlock(block, oldBlocks[block.path("id").asText()]) }
    }

    private fun validateBlock(block: JsonNode, old: JsonNode?) {
        if (!block.hasNonNull("gameId") && !block.hasNonNull("gameRevisionId")) {
            if (block.path("url").asText().isNotBlank() && old?.path("url")?.asText() != block.path("url").asText()) games.requireWritable()
            if (old?.hasNonNull("gameId") == true) gameError(HttpStatus.CONFLICT, "GAME_CLIENT_UPDATE_REQUIRED")
            return
        }
        val id = gameUuid(block.path("gameId").asText())
        val revisionId = gameUuid(block.path("gameRevisionId").asText())
        games.requireGame(id, revisionId)
        val same = old?.path("gameId")?.asText() == id.toString() && old.path("gameRevisionId").asText() == revisionId.toString()
        if (!same) { games.requireWritable(); games.requireNewReference(id, revisionId) }
        if (block.path("url").asText().isNotBlank()) gameError(HttpStatus.BAD_REQUEST, "GAME_REFERENCE_INVALID")
    }

    @Transactional
    fun attach(auth: JwtAuthenticationToken, materialId: UUID, request: MaterialGameAttachRequest, catalog: LessonMaterialCatalogService): LessonMaterialResponse {
        games.requireWritable()
        catalog.requireEditable(auth, materialId, com.playsay.gateway.utils.MetaData.ErrorCodes.MATERIAL_EDIT_FORBIDDEN)
        val material = materials.lockById(materialId) ?: gameError(HttpStatus.NOT_FOUND, "GAME_MATERIAL_NOT_FOUND")
        val document = mapper.readTree(material.document)
        val page = document.path("pages").firstOrNull { it.path("id").asText() == request.pageId } as? ObjectNode ?: gameError(HttpStatus.BAD_REQUEST, "GAME_PAGE_NOT_FOUND")
        val blocks = page.withArray("blocks")
        val existing = blocks.firstOrNull { it.path("id").asText() == request.blockId }
        if (existing != null) {
            if (existing.path("gameId").asText() == request.gameId.toString() && existing.path("gameRevisionId").asText() == request.revisionId.toString()) return catalog.toResponse(catalog.requireActive(materialId))
            gameError(HttpStatus.CONFLICT, "GAME_ATTACH_CONFLICT")
        }
        if (material.updatedAt != request.expectedUpdatedAt) gameError(HttpStatus.CONFLICT, "GAME_MATERIAL_CONFLICT")
        if (request.blockId.isBlank() || request.blockId.length > 120 || document.path("pages").any { it.path("blocks").any { block -> block.path("id").asText() == request.blockId } }) gameError(HttpStatus.BAD_REQUEST, "GAME_REFERENCE_INVALID")
        val game = games.requireNewReference(request.gameId, request.revisionId)
        blocks.add(mapper.createObjectNode().put("id", request.blockId).put("type", "htmlGame").put("title", game.title).put("gameId", game.id.toString()).put("gameRevisionId", game.revisionId.toString()).put("gameSyncCompatibility", game.compatibility).put("height", 640))
        material.document = mapper.writeValueAsString(document)
        material.updatedAt = Instant.now()
        materials.saveAndFlush(material)
        return catalog.toResponse(catalog.requireActive(materialId))
    }
    @Transactional
    fun createMaterial(auth: JwtAuthenticationToken, gameId: UUID, request: com.playsay.gateway.dto.HtmlGameMaterialRequest, catalog: LessonMaterialCatalogService): LessonMaterialResponse {
        val userId = games.requireTeacher(auth)
        games.requireWritable()
        repository.lockGame(gameId)
        val key = gameHash("$userId:create-material:${request.commandId}".toByteArray())
        val previous = repository.jdbc.queryForList("SELECT * FROM html_game_material_command WHERE command_key=?", key).firstOrNull()
        if (previous != null) {
            if (previous["game_id"] != gameId || previous["revision_id"] != request.revisionId) gameError(HttpStatus.CONFLICT, "GAME_COMMAND_CONFLICT")
            return catalog.get(auth, previous["material_id"] as? UUID ?: gameError(HttpStatus.CONFLICT, "GAME_MATERIAL_NOT_FOUND"))
        }
        val game = games.requireNewReference(gameId, request.revisionId)
        val document = mapper.createObjectNode().put("schemaVersion", 1)
        val page = mapper.createObjectNode().put("id", "page-${UUID.randomUUID()}").put("title", game.title).put("layout", "FLOW")
        page.putArray("blocks").add(mapper.createObjectNode().put("id", "block-${UUID.randomUUID()}").put("type", "htmlGame").put("title", game.title).put("gameId", gameId.toString()).put("gameRevisionId", request.revisionId.toString()).put("gameTitleSource", "HTML").put("gameSyncCompatibility", game.compatibility).put("height", 640))
        document.putArray("pages").add(page)
        val saved = catalog.create(auth, com.playsay.gateway.dto.LessonMaterialRequest(title = game.title, cefrLevel = game.cefrLevel ?: "A2", document = document))
        repository.jdbc.update("INSERT INTO html_game_material_command(command_key,game_id,revision_id,material_id) VALUES(?,?,?,?)", key, gameId, request.revisionId, saved.id)
        return saved
    }

}

internal fun gameUuid(value: String): UUID = runCatching { UUID.fromString(value) }.getOrElse { gameError(HttpStatus.BAD_REQUEST, "GAME_REFERENCE_INVALID") }
