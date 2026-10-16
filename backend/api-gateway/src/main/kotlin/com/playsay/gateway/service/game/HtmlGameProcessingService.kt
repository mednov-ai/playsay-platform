package com.playsay.gateway.service.game

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.client.MaterialGameAdapterClient
import com.playsay.gateway.dto.HtmlGameProcessingRequest
import com.playsay.gateway.dto.HtmlGameProcessingResponse
import com.playsay.gateway.dto.HtmlGameResponse
import com.playsay.gateway.dto.HtmlGameRevisionSelection
import com.playsay.gateway.repo.game.HtmlGameRepository
import com.playsay.gateway.service.*
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate

/** Slow processing reads a pinned game revision and never changes a material or active launch. */
@Service
// Constructor mirrors persistence fields or coordinates existing domain boundaries.
@Suppress("LongParameterList")
class HtmlGameProcessingService(
    private val games: HtmlGameLibraryService,
    private val repository: HtmlGameRepository,
    private val blobs: GameBlobStorageService,
    private val objects: MaterialObjectStorage,
    private val adapter: MaterialGameAdapterClient,
    private val uploads: MaterialAssetUploadService,
    private val metadata: MaterialHtmlGameMetadataService,
    private val ai: MaterialHtmlGameAiService,
    private val images: MaterialImageGenerationService,
    private val mapper: ObjectMapper,
    @param:org.springframework.beans.factory.annotation.Qualifier("materialHtmlGameEnrichmentExecutor") private val executor: java.util.concurrent.ExecutorService,
    private val availability: GameLibraryAvailabilityService,
    @param:org.springframework.beans.factory.annotation.Value("\${playsay.games.processing.enabled:true}") private val enabled: Boolean,
    transactionManager: PlatformTransactionManager,
) {
    private val busy = java.util.concurrent.atomic.AtomicBoolean(false)
    private val tx = TransactionTemplate(transactionManager)

    @Transactional
    fun request(auth: JwtAuthenticationToken, gameId: UUID, request: HtmlGameProcessingRequest): HtmlGameProcessingResponse {
        games.requireEditable(auth, gameId)
        games.requireActive(gameId, request.revisionId)
        if (request.kind !in setOf("ADAPT", "ENRICH")) gameError(HttpStatus.BAD_REQUEST, "GAME_QUERY_INVALID")
        val key = gameHash("$gameId:${request.commandId}".toByteArray())
        repository.jdbc.queryForList("SELECT * FROM html_game_processing WHERE command_key=?", key).firstOrNull()?.let {
            if (it["source_revision_id"] != request.revisionId || it["kind"] != request.kind) gameError(HttpStatus.CONFLICT, "GAME_COMMAND_CONFLICT")
            return response(it)
        }
        val id = UUID.randomUUID()
        val now = Timestamp.from(Instant.now())
        repository.jdbc.update("INSERT INTO html_game_processing(id,game_id,source_revision_id,kind,status,command_key,created_at,updated_at) VALUES(?,?,?,?,'PENDING',?,?,?)", id, gameId, request.revisionId, request.kind, key, now, now)
        return statusInternal(gameId, id)
    }

    @Transactional(readOnly = true)
    fun status(auth: JwtAuthenticationToken, gameId: UUID, id: UUID): HtmlGameProcessingResponse {
        games.get(auth, gameId)
        return statusInternal(gameId, id)
    }

    @Transactional
    fun apply(auth: JwtAuthenticationToken, gameId: UUID, id: UUID, expectedVersion: Long): HtmlGameResponse {
        games.requireEditable(auth, gameId)
        val row = row(gameId, id)
        val previous = row["applied_revision_id"] as? UUID
        if (previous != null) return games.requireGame(gameId, previous).copy(canEdit = true)
        val current = games.requireGame(gameId)
        if (current.version != expectedVersion || current.revisionId != row["source_revision_id"]) gameError(HttpStatus.CONFLICT, "GAME_VERSION_CONFLICT")
        val evidence = mapper.readTree(row["evidence"].toString())
        if (row["status"] != "READY_FOR_REVIEW" || row["kind"] != "ADAPT" || evidence.path("validatorVersion").asText() != MaterialGameMechanicsValidation.CURRENT_VALIDATOR_VERSION || !evidence.path("mechanicsEquivalent").asBoolean()) gameError(HttpStatus.CONFLICT, "GAME_ADAPTATION_NOT_ACCEPTED")
        val source = repository.blob(current.revisionId) ?: gameError(HttpStatus.NOT_FOUND, "GAME_CONTENT_NOT_FOUND")
        if (evidence.path("sourceHash").asText() != source.sha256) gameError(HttpStatus.CONFLICT, "GAME_CONTENT_INVALID")
        val bytes = blobs.read(row["candidate_blob_id"] as UUID)
        val acceptedEvidence = mapper.readTree(row["evidence"].toString()).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("mechanicsValidation", "PASSED").toString()
        val revision = games.addRevision(gameId, bytes, "SDK_V1", acceptedEvidence, current.revisionId)
        repository.jdbc.update("UPDATE html_game SET current_revision_id=?,version=version+1,updated_at=? WHERE id=?", revision, Timestamp.from(Instant.now()), gameId)
        repository.jdbc.update("UPDATE html_game_processing SET applied_revision_id=?,status='APPLIED',updated_at=? WHERE id=?", revision, Timestamp.from(Instant.now()), id)
        return games.requireGame(gameId).copy(canEdit = true)
    }

    @Transactional
    fun selectRevision(auth: JwtAuthenticationToken, gameId: UUID, request: HtmlGameRevisionSelection): HtmlGameResponse {
        games.requireEditable(auth, gameId)
        games.requireActive(gameId, request.revisionId)
        if (repository.jdbc.update("UPDATE html_game SET current_revision_id=?,version=version+1,updated_at=? WHERE id=? AND version=?", request.revisionId, Timestamp.from(Instant.now()), gameId, request.expectedVersion) != 1) gameError(HttpStatus.CONFLICT, "GAME_VERSION_CONFLICT")
        return games.requireGame(gameId).copy(canEdit = true)
    }

    @Transactional(readOnly = true)
    fun preview(auth: JwtAuthenticationToken, gameId: UUID, id: UUID): ByteArray {
        games.get(auth, gameId)
        val row = row(gameId, id)
        if (row["status"] !in setOf("READY_FOR_REVIEW", "APPLIED")) gameError(HttpStatus.CONFLICT, "GAME_ADAPTATION_NOT_ACCEPTED")
        return blobs.read(row["candidate_blob_id"] as UUID)
    }

    /** SQL lease also bounds abandoned work; generation is ignored after a lease is reclaimed. */
    @Scheduled(fixedDelayString = "\${playsay.games.processing.poll-ms:10000}")
    fun dispatch() { if (enabled) poll() }

    fun poll() {
        if (!busy.compareAndSet(false, true)) return
        try { availability.requireBackgroundProcessing() } catch (_: Exception) { busy.set(false); return }
        val claim = try { tx.execute {
            val now = Timestamp.from(Instant.now())
            repository.jdbc.update("UPDATE html_game_processing SET status='FAILED',error_code='GAME_PROCESSING_FAILED',lease_until=NULL WHERE status='RUNNING' AND lease_until<? AND attempts>=3", now)
            val row = repository.jdbc.queryForList("SELECT * FROM html_game_processing WHERE (status='PENDING' OR (status='RUNNING' AND lease_until<?)) AND attempts<3 ORDER BY created_at LIMIT 1 FOR UPDATE", now).firstOrNull() ?: return@execute null
            val generation = (row["attempts"] as Number).toInt() + 1
            repository.jdbc.update("UPDATE html_game_processing SET status='RUNNING',attempts=?,lease_until=?,updated_at=? WHERE id=?", generation, Timestamp.from(Instant.now().plusSeconds(600)), now, row["id"])
            row to generation
        } } catch (_: Exception) { busy.set(false); return } ?: run { busy.set(false); return }
        try { executor.execute { try { process(claim.first, claim.second) } finally { busy.set(false) } } } catch (_: Exception) { busy.set(false) }
    }

    private fun process(row: Map<String, Any?>, generation: Int) {
        val id = row["id"] as UUID
        val gameId = row["game_id"] as UUID
        val revision = row["source_revision_id"] as UUID
        try {
            val blob = repository.blob(revision) ?: gameError(HttpStatus.NOT_FOUND, "GAME_CONTENT_NOT_FOUND")
            val bytes = objects.getObject(blob.storageKey).bytes
            if (gameHash(bytes) != blob.sha256) gameError(HttpStatus.BAD_GATEWAY, "GAME_CONTENT_INVALID")
            if (row["kind"] == "ADAPT") {
                val result = adapter.adapt(bytes.toString(Charsets.UTF_8))
                if (!result.mechanicsEquivalent || result.validatorVersion != MaterialGameMechanicsValidation.CURRENT_VALIDATOR_VERSION || result.sourceHash != blob.sha256 || classifyHtmlGameCompatibility(result.html) != "SDK_V1") gameError(HttpStatus.CONFLICT, "GAME_ADAPTATION_NOT_ACCEPTED")
                val candidate = uploads.revalidateHtmlGameBytes(ValidatedMaterialAssetFile("game.html", "text/html", bytes, bytes.toString(Charsets.UTF_8)), result.html.toByteArray()).bytes
                tx.executeWithoutResult {
                    if (!ownsLease(id, generation)) return@executeWithoutResult
                    val candidateId = blobs.put(gameId, candidate, "text/html")
                    val evidence = mapper.valueToTree<com.fasterxml.jackson.databind.node.ObjectNode>(result).apply { remove("html") }.toString()
                    repository.jdbc.update("UPDATE html_game_processing SET candidate_blob_id=?,evidence=?,status='READY_FOR_REVIEW',lease_until=NULL,updated_at=? WHERE id=?", candidateId, evidence, Timestamp.from(Instant.now()), id)
                }
            } else {
                val extracted = metadata.extract(bytes, "game.html")
                val analysis = ai.analyze(MaterialHtmlGameAiInput(extracted.title, extracted.titleNeedsAi, extracted.context))
                val generated = images.generate(MaterialImageGenerationInput(prompt = analysis.iconPrompt, alt = analysis.title))
                tx.executeWithoutResult {
                    if (!ownsLease(id, generation)) return@executeWithoutResult
                    val cover = blobs.put(gameId, generated.bytes, generated.mimeType)
                    repository.jdbc.update("UPDATE html_game_revision SET cover_blob_id=? WHERE id=?", cover, revision)
                    repository.jdbc.update("UPDATE html_game SET title=CASE WHEN title_source='USER' THEN title ELSE ? END,updated_at=? WHERE id=? AND current_revision_id=?", analysis.title.take(160), Timestamp.from(Instant.now()), gameId, revision)
                    repository.jdbc.update("UPDATE html_game_processing SET status='READY',lease_until=NULL,updated_at=? WHERE id=?", Timestamp.from(Instant.now()), id)
                }
            }
        } catch (error: Exception) {
            val code = (error as? com.playsay.gateway.client.GameAdapterClientException)?.adapterErrorCode ?: (error as? com.playsay.gateway.error.ProjectResponseException)?.errorCode ?: "GAME_PROCESSING_FAILED"
            tx.executeWithoutResult { repository.jdbc.update("UPDATE html_game_processing SET status='FAILED',error_code=?,lease_until=NULL,updated_at=? WHERE id=? AND attempts=? AND status='RUNNING'", code, Timestamp.from(Instant.now()), id, generation) }
        }
    }

    private fun ownsLease(id: UUID, generation: Int): Boolean = repository.jdbc.queryForList("SELECT id FROM html_game_processing WHERE id=? AND attempts=? AND status='RUNNING' FOR UPDATE", id, generation).isNotEmpty()
    private fun row(gameId: UUID, id: UUID): Map<String, Any?> = repository.jdbc.queryForList("SELECT * FROM html_game_processing WHERE id=? AND game_id=?", id, gameId).firstOrNull() ?: gameError(HttpStatus.NOT_FOUND, "GAME_NOT_FOUND")
    private fun statusInternal(gameId: UUID, id: UUID) = response(row(gameId, id))
    private fun response(row: Map<String, Any?>) = HtmlGameProcessingResponse(row["id"] as UUID, row["game_id"] as UUID, row["source_revision_id"] as UUID, row["kind"].toString(), row["status"].toString(), row["error_code"] as? String, row["applied_revision_id"] as? UUID)
}
