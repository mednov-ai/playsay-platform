package com.playsay.gateway.service.game

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.JsonNode
import com.playsay.gateway.repo.game.HtmlGameRepository
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile

@Service
class LegacyGameUploadCommandService(private val repository: HtmlGameRepository, private val mapper: ObjectMapper) {
    /** Caller authorizes and holds the surrounding transaction. Only opaque target IDs are retained. */
    fun run(scope: String, scopeId: UUID, command: UUID?, file: MultipartFile, action: () -> JsonNode): JsonNode {
        if (command == null) return action()
        val table = if (scope == "lesson") "lesson" else "lesson_material"
        repository.jdbc.queryForList("SELECT id FROM $table WHERE id=? FOR UPDATE", scopeId)
        val key = gameHash("$scope:$scopeId:$command".toByteArray())
        val hash = gameHash(file.bytes)
        repository.jdbc.queryForList("SELECT payload_hash,result FROM html_game_legacy_upload_command WHERE command_key=?", key).firstOrNull()?.let {
            if (it["payload_hash"] != hash) gameError(HttpStatus.CONFLICT, "GAME_COMMAND_CONFLICT")
            return mapper.readTree(it["result"].toString())
        }
        val result = action()
        repository.jdbc.update("INSERT INTO html_game_legacy_upload_command(command_key,payload_hash,result) VALUES(?,?,?)", key, hash, result.toString())
        return result
    }
}
