package com.playsay.gateway.repo.game

import java.sql.Timestamp
import java.util.UUID
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

/** Revision-owned processing commands and fenced queue leases. Caller owns the transaction. */
@Repository
class HtmlGameProcessingRepository(private val jdbc: JdbcTemplate) {
    fun command(key: String) = jdbc.queryForList("SELECT * FROM html_game_processing WHERE command_key=?", key)
    fun enqueue(id: UUID, game: UUID, revision: UUID, kind: String, key: String, now: Timestamp) = jdbc.update("INSERT INTO html_game_processing(id,game_id,source_revision_id,kind,status,command_key,created_at,updated_at) VALUES(?,?,?,?,'PENDING',?,?,?)", id, game, revision, kind, key, now, now)
    fun applied(revision: UUID, now: Timestamp, id: UUID) = jdbc.update("UPDATE html_game_processing SET applied_revision_id=?,status='APPLIED',updated_at=? WHERE id=?", revision, now, id)
    fun expireExhausted(now: Timestamp) = jdbc.update("UPDATE html_game_processing SET status='FAILED',error_code='GAME_PROCESSING_FAILED',lease_until=NULL WHERE status='RUNNING' AND lease_until<? AND attempts>=3", now)
    fun nextClaim(now: Timestamp) = jdbc.queryForList("SELECT * FROM html_game_processing WHERE (status='PENDING' OR (status='RUNNING' AND lease_until<?)) AND attempts<3 ORDER BY created_at LIMIT 1 FOR UPDATE", now)
    fun claim(generation: Int, lease: Timestamp, now: Timestamp, id: UUID) = jdbc.update("UPDATE html_game_processing SET status='RUNNING',attempts=?,lease_until=?,updated_at=? WHERE id=?", generation, lease, now, id)
    fun candidate(blob: UUID, evidence: String, now: Timestamp, id: UUID) = jdbc.update("UPDATE html_game_processing SET candidate_blob_id=?,evidence=?,status='READY_FOR_REVIEW',lease_until=NULL,updated_at=? WHERE id=?", blob, evidence, now, id)
    fun enrichTitle(title: String, now: Timestamp, game: UUID, revision: UUID) = jdbc.update("UPDATE html_game SET title=CASE WHEN title_source='USER' THEN title ELSE ? END,updated_at=? WHERE id=? AND current_revision_id=?", title, now, game, revision)
    fun ready(now: Timestamp, id: UUID) = jdbc.update("UPDATE html_game_processing SET status='READY',lease_until=NULL,updated_at=? WHERE id=?", now, id)
    fun failed(code: String, now: Timestamp, id: UUID, generation: Int) = jdbc.update("UPDATE html_game_processing SET status='FAILED',error_code=?,lease_until=NULL,updated_at=? WHERE id=? AND attempts=? AND status='RUNNING'", code, now, id, generation)
    fun lease(id: UUID, generation: Int) = jdbc.queryForList("SELECT id FROM html_game_processing WHERE id=? AND attempts=? AND status='RUNNING' FOR UPDATE", id, generation)
    fun row(id: UUID, game: UUID) = jdbc.queryForList("SELECT * FROM html_game_processing WHERE id=? AND game_id=?", id, game)
}
