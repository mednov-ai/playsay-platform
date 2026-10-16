package com.playsay.gateway.service.game

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.HtmlGameEditRequest
import com.playsay.gateway.dto.HtmlGamePageResponse
import com.playsay.gateway.dto.HtmlGameResponse
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.game.HtmlGameRepository
import com.playsay.gateway.service.MaterialAssetUploadService
import com.playsay.gateway.service.MaterialHtmlGameMetadataService
import com.playsay.gateway.service.MaterialHtmlGameOptimizationService
import com.playsay.gateway.service.UserProfileStore
import com.playsay.gateway.service.classifyHtmlGameCompatibility
import com.playsay.gateway.utils.MetaData
import java.security.MessageDigest
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile

@Service
class HtmlGameLibraryService(
    private val repository: HtmlGameRepository,
    private val profiles: UserProfileStore,
    private val uploads: MaterialAssetUploadService,
    private val optimizer: MaterialHtmlGameOptimizationService,
    private val metadata: MaterialHtmlGameMetadataService,
    private val mapper: ObjectMapper,
    private val availability: GameLibraryAvailabilityService,
    private val blobs: GameBlobStorageService,
) {
    @Transactional(readOnly = true)
    fun list(auth: JwtAuthenticationToken, search: String, topic: String, level: String?, compatibility: String?, page: Int, size: Int): HtmlGamePageResponse {
        val userId = requireTeacher(auth)
        if (page !in 0..100000 || size !in 1..100 || search.length > 160 || topic.length > 120) gameError(HttpStatus.BAD_REQUEST, "GAME_QUERY_INVALID")
        val (items, total) = repository.list(search.trim(), topic.trim(), level?.takeIf { it.isNotBlank() }, compatibility?.takeIf { it.isNotBlank() }, page, size)
        return HtmlGamePageResponse(items.map { it.copy(canEdit = isAdmin(auth) || repository.creator(it.id) == userId) }, total, page, size)
    }

    @Transactional(readOnly = true)
    fun get(auth: JwtAuthenticationToken, id: UUID, revisionId: UUID? = null): HtmlGameResponse {
        val userId = requireTeacher(auth)
        return requireGame(id, revisionId).copy(canEdit = isAdmin(auth) || repository.creator(id) == userId)
    }

    @Transactional
    fun upload(auth: JwtAuthenticationToken, file: MultipartFile, commandId: UUID, gameId: UUID? = null, expectedVersion: Long? = null): HtmlGameResponse {
        requireWritable()
        val creatorId = requireTeacher(auth)
        val raw = uploads.validateHtmlGameFile(file)
        val payloadHash = gameHash(raw.bytes)
        val key = gameHash("$creatorId:upload:$gameId:$commandId".toByteArray())
        repository.command(key)?.let {
            if (it.payloadHash != payloadHash) gameError(HttpStatus.CONFLICT, "GAME_COMMAND_CONFLICT")
            return requireGame(it.gameId, it.revisionId).copy(canEdit = isAdmin(auth) || repository.creator(it.gameId) == creatorId)
        }
        if (gameId != null && !isAdmin(auth) && repository.creator(gameId) != creatorId) gameError(HttpStatus.FORBIDDEN, "GAME_EDIT_FORBIDDEN")
        val optimized = optimizer.optimizeIfRequired(raw)
        // The potentially slow optimizer never holds the actor identity row lock.
        repository.lockCreator(creatorId)
        repository.command(key)?.let {
            if (it.payloadHash != payloadHash) gameError(HttpStatus.CONFLICT, "GAME_COMMAND_CONFLICT")
            return requireGame(it.gameId, it.revisionId).copy(canEdit = isAdmin(auth) || repository.creator(it.gameId) == creatorId)
        }
        if (gameId != null) {
            requireEditable(auth, gameId, creatorId)
            if (expectedVersion == null || requireGame(gameId).version != expectedVersion) gameError(HttpStatus.CONFLICT, "GAME_VERSION_CONFLICT")
        }
        val title = metadata.extract(optimized.upload.bytes, raw.originalFileName).displayTitle
        val now = Instant.now()
        val id = gameId ?: UUID.randomUUID()
        if (gameId == null) repository.createGame(id, creatorId, title, Timestamp.from(now))
        val revision = addRevision(id, optimized.upload.bytes, classifyHtmlGameCompatibility(requireNotNull(optimized.upload.text)), mapper.writeValueAsString(mapOf("optimization" to optimized.metadata)))
        repository.advanceRevision(revision, Timestamp.from(now), id)
        repository.recordCommand(key, payloadHash, id, revision)
        return requireGame(id, revision).copy(canEdit = true)
    }

    @Transactional
    fun edit(auth: JwtAuthenticationToken, id: UUID, request: HtmlGameEditRequest): HtmlGameResponse {
        requireEditable(auth, id)
        val title = request.title.trim()
        if (title.isEmpty() || title.length > 160 || request.topic.length > 120 || request.cefrLevel?.let { it !in setOf("PRE_A1", "A1", "A2", "B1", "B2", "C1", "C2") } == true) gameError(HttpStatus.BAD_REQUEST, "GAME_METADATA_INVALID")
        val changed = repository.editMetadata(title, request.topic.trim(), request.cefrLevel, Timestamp.from(Instant.now()), id, request.expectedVersion)
        if (changed != 1) gameError(HttpStatus.CONFLICT, "GAME_VERSION_CONFLICT")
        return requireGame(id).copy(canEdit = true)
    }

    @Transactional
    fun archive(auth: JwtAuthenticationToken, id: UUID) {
        requireEditable(auth, id)
        repository.archive(Timestamp.from(Instant.now()), id)
    }

    @Transactional
    fun fork(auth: JwtAuthenticationToken, sourceId: UUID, revisionId: UUID, commandId: UUID): HtmlGameResponse {
        requireWritable()
        val creatorId = requireTeacher(auth)
        repository.lockCreator(creatorId)
        val key = gameHash("$creatorId:fork:$commandId".toByteArray())
        val payload = gameHash("$sourceId:$revisionId".toByteArray())
        repository.command(key)?.let {
            if (it.payloadHash != payload) gameError(HttpStatus.CONFLICT, "GAME_COMMAND_CONFLICT")
            return requireGame(it.gameId, it.revisionId).copy(canEdit = isAdmin(auth) || repository.creator(it.gameId) == creatorId)
        }
        val source = requireActive(sourceId, revisionId)
        val id = UUID.randomUUID()
        val revision = UUID.randomUUID()
        val now = Timestamp.from(Instant.now())
        repository.createGame(id, creatorId, source.title, now, source.topic, source.cefrLevel, revisionId)
        repository.copyRevision(revision, id, now, revisionId)
        repository.setInitialRevision(revision, id)
        repository.recordCommand(key, payload, id, revision)
        return requireGame(id).copy(canEdit = true)
    }

    fun requireWritable() = availability.requireWrites()
    fun requireGame(id: UUID, revisionId: UUID? = null): HtmlGameResponse = repository.game(id, revisionId) ?: gameError(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND")
    fun requireActive(id: UUID, revisionId: UUID): HtmlGameResponse = requireGame(id, revisionId).also { if (it.status != "ACTIVE") gameError(HttpStatus.CONFLICT, "GAME_ARCHIVED") }
    fun requireNewReference(id: UUID, revisionId: UUID): HtmlGameResponse = requireActive(id, revisionId).also {
        if (it.validationStatus == "REVALIDATION_REQUIRED") gameError(HttpStatus.CONFLICT, "GAME_ADAPTATION_NOT_ACCEPTED")
    }
    fun requireTeacher(auth: JwtAuthenticationToken): UUID {
        if (!isTeacher(auth)) gameError(HttpStatus.FORBIDDEN, "GAME_ACCESS_DENIED")
        return profiles.currentUserId(auth)
    }
    fun isTeacher(auth: JwtAuthenticationToken): Boolean = auth.authorities.any { it.authority in setOf(MetaData.Authorities.TEACHER, MetaData.Authorities.ADMIN) }
    fun isAdmin(auth: JwtAuthenticationToken): Boolean = auth.authorities.any { it.authority == MetaData.Authorities.ADMIN }
    fun requireEditable(auth: JwtAuthenticationToken, id: UUID, knownUserId: UUID? = null) {
        requireWritable()
        val userId = knownUserId ?: requireTeacher(auth)
        repository.lockGame(id)
        requireGame(id)
        if (!isAdmin(auth) && repository.creator(id) != userId) gameError(HttpStatus.FORBIDDEN, "GAME_EDIT_FORBIDDEN")
    }

    /** Caller must hold a transaction. Objects never belong to the source material. */
    fun addRevision(gameId: UUID, bytes: ByteArray, compatibility: String, metadata: String, sourceRevisionId: UUID? = null): UUID {
        val revisionId = UUID.randomUUID()
        val blobId = blobs.put(gameId, bytes, "text/html")
        val now = Timestamp.from(Instant.now())
        repository.insertRevision(revisionId, gameId, blobId, sourceRevisionId, compatibility, metadata, now)
        return revisionId
    }
}

internal fun gameHash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
internal fun gameError(status: HttpStatus, code: String): Nothing = throw ProjectResponseException(status, code, errorCode = code, messageCode = code)
