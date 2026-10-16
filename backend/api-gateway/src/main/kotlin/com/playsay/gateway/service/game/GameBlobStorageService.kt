package com.playsay.gateway.service.game

import com.playsay.gateway.service.MaterialObjectStorage
import com.playsay.gateway.repo.game.HtmlGameRepository
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager

/** A private immutable object is visible in SQL only after read-after-write verification. */
@Service
class GameBlobStorageService(private val objects: MaterialObjectStorage, private val repository: HtmlGameRepository) {
    fun put(gameId: UUID, bytes: ByteArray, contentType: String): UUID {
        check(TransactionSynchronizationManager.isSynchronizationActive())
        val id = UUID.randomUUID()
        val key = "game-library/$gameId/$id"
        // Register cleanup before PUT: a failed response may still have stored the object.
        TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
            override fun afterCompletion(status: Int) {
                if (status != TransactionSynchronization.STATUS_COMMITTED) runCatching { objects.deleteObject(key) }
            }
        })
        val hash = gameHash(bytes)
        try {
            objects.putObject(key, bytes, contentType)
            if (gameHash(objects.getObject(key).bytes) != hash) gameError(HttpStatus.BAD_GATEWAY, "GAME_CONTENT_INVALID")
        } catch (error: com.playsay.gateway.error.ProjectResponseException) { throw error }
        catch (error: Exception) { gameError(HttpStatus.SERVICE_UNAVAILABLE, "GAME_STORAGE_UNAVAILABLE") }
        repository.jdbc.update("INSERT INTO html_game_blob(id,storage_key,sha256,byte_size,content_type,created_at) VALUES(?,?,?,?,?,?)", id, key, hash, bytes.size, contentType, Timestamp.from(Instant.now()))
        return id
    }
    fun read(id: UUID): ByteArray {
        val row = repository.jdbc.queryForList("SELECT storage_key,sha256 FROM html_game_blob WHERE id=?", id).firstOrNull() ?: gameError(HttpStatus.NOT_FOUND, "GAME_CONTENT_NOT_FOUND")
        val bytes = readObject(row["storage_key"].toString())
        if (gameHash(bytes) != row["sha256"]) gameError(HttpStatus.BAD_GATEWAY, "GAME_CONTENT_INVALID")
        return bytes
    }
    fun readVerified(blob: com.playsay.gateway.repo.game.GameBlob): ByteArray {
        val bytes = readObject(blob.storageKey)
        if (gameHash(bytes) != blob.sha256) gameError(HttpStatus.BAD_GATEWAY, "GAME_CONTENT_INVALID")
        return bytes
    }
    private fun readObject(key: String): ByteArray = try { objects.getObject(key).bytes }
        catch (_: com.playsay.gateway.service.MaterialObjectNotFoundException) { gameError(HttpStatus.NOT_FOUND, "GAME_CONTENT_NOT_FOUND") }
        catch (_: Exception) { gameError(HttpStatus.SERVICE_UNAVAILABLE, "GAME_STORAGE_UNAVAILABLE") }

}
